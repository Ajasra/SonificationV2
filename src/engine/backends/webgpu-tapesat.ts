/// <reference types="@webgpu/types" />

// Experimental f32 affine recurrence backend. Never selected by the application.
const shader = `
struct Params { n:u32, groups:u32, stride:u32, stage:u32, drive:f32, bias:f32, dc:f32, norm:f32, bumpA:f32, toneA:f32, bump:f32, pad:f32 }
@group(0) @binding(0) var<uniform> p:Params;
@group(0) @binding(1) var<storage,read> input:array<f32>;
@group(0) @binding(2) var<storage,read_write> local:array<f32>;
@group(0) @binding(3) var<storage,read_write> summaries:array<vec2<f32>>;
@group(0) @binding(4) var<storage,read_write> scanned:array<vec2<f32>>;
@group(0) @binding(5) var<storage,read_write> state:array<f32>;
fn value(i:u32)->f32 {
 if(p.stage==1u){return input[i];}
 let z=p.drive*(input[i]+p.bias); let zz=z*z;
 let t=select(select(z*(27.0+zz)/(27.0+9.0*zz),1.0,z>3.0),-1.0,z< -3.0);
 return (t-p.dc)*p.norm;
}
@compute @workgroup_size(64) fn tiles(@builtin(global_invocation_id) id:vec3<u32>){
 let g=id.x; if(g>=p.groups){return;} let a=select(p.bumpA,p.toneA,p.stage==1u);
 var s=0.0; var power=1.0;
 for(var i=g*256u;i<min(p.n,(g+1u)*256u);i++){
  s=(1.0-a)*s+a*value(i); power*=1.0-a; local[i]=s;
 }
 summaries[g]=vec2<f32>(power,s);
}
@compute @workgroup_size(64) fn scan(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x; if(i>=p.groups){return;} var v=summaries[i];
 if(i>=p.stride){let left=summaries[i-p.stride];v=vec2<f32>(v.x*left.x,v.y+v.x*left.y);}
 scanned[i]=v;
}
@compute @workgroup_size(256) fn apply(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x; if(i>=p.n){return;} let g=i/256u;
 var carry=state[p.stage]; if(g>0u){let v=summaries[g-1u];carry=v.y+v.x*carry;}
 let a=select(p.bumpA,p.toneA,p.stage==1u);
 let s=local[i]+pow(1.0-a,f32(i%256u+1u))*carry;
 scanned[i]=vec2<f32>(s,0.0);
}
@compute @workgroup_size(256) fn finish(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=p.n){return;}let s=scanned[i].x;
 local[i]=select(value(i)+p.bump*s,s,p.stage==1u);
}
@compute @workgroup_size(1) fn save(){state[p.stage]=scanned[p.n-1u].x;}
`;

export class WebGpuTapeSat {
  readonly adapterInfo: GPUAdapterInfo;
  private busy = false;
  private disposed = false;
  private readonly state: GPUBuffer;
  private readonly pipelines: Record<string, GPUComputePipeline>;
  private constructor(private readonly device: GPUDevice, adapter: GPUAdapter, pipelines: Record<string, GPUComputePipeline>) {
    this.adapterInfo = adapter.info; this.pipelines = pipelines;
    this.state = device.createBuffer({ size: 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
  }
  static async create(): Promise<WebGpuTapeSat> {
    if (!navigator.gpu) throw new Error('WebGPU unavailable');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter');
    const device = await adapter.requestDevice();
    try {
      const module = device.createShaderModule({ code: shader });
      const info = await module.getCompilationInfo();
      const errors = info.messages.filter(message => message.type === 'error');
      if (errors.length) throw new Error(errors.map(message => message.message).join('\n'));
      const entries = await Promise.all(['tiles', 'scan', 'apply', 'finish', 'save'].map(async entryPoint =>
        [entryPoint, await device.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint } })] as const));
      return new WebGpuTapeSat(device, adapter, Object.fromEntries(entries));
    } catch (error) { device.destroy(); throw error; }
  }
  reset(): void { if (this.busy || this.disposed) throw new Error('Backend unavailable'); this.device.queue.writeBuffer(this.state, 0, new Float32Array(2)); }
  dispose(): void { this.disposed = true; this.device.destroy(); }
  async process(samples: Float32Array, params: Record<string, number> = {}, rate = 44100): Promise<Float32Array> {
    if (this.busy || this.disposed) throw new Error('Backend unavailable');
    if (!Number.isFinite(rate) || rate <= 0 || Object.values(params).some(value => !Number.isFinite(value))) throw new Error('Invalid parameters');
    if (!samples.length) return new Float32Array();
    const n = samples.length, groups = Math.ceil(n / 256), bytes = n * 4;
    if (bytes * 2 > this.device.limits.maxStorageBufferBindingSize) throw new Error('Sample block exceeds device limits');
    this.busy = true;
    const buffers: GPUBuffer[] = [];
    const buffer = (size: number, usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST) => {
      const result = this.device.createBuffer({ size, usage }); buffers.push(result); return result;
    };
    this.device.pushErrorScope('validation');
    let scopePending = true;
    try {
      const input = buffer(bytes), local = buffer(bytes), sums = buffer(Math.max(groups * 8, bytes * 2)), scratch = buffer(Math.max(groups * 8, bytes * 2));
      const read = buffer(bytes, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
      this.device.queue.writeBuffer(input, 0, samples as Float32Array<ArrayBuffer>);
      const clamp = (v:number, low:number, high:number) => Math.min(high, Math.max(low, v));
      const drive = clamp(params.drive ?? 2.5, 1, 10), bias = clamp(params.bias ?? .1, -.5, .5);
      const tanh = (z:number) => z < -3 ? -1 : z > 3 ? 1 : z*(27+z*z)/(27+9*z*z);
      const encoder = this.device.createCommandEncoder();
      for (let stage = 0; stage < 2; stage++) {
        const dispatch = (entry:string, stride:number, source:GPUBuffer, target:GPUBuffer, count:number) => {
          const uniform = buffer(48, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
          const data = new ArrayBuffer(48); new Uint32Array(data).set([n, groups, stride, stage]);
          new Float32Array(data,16).set([drive,bias,tanh(drive*bias),1/Math.max(.2,tanh(drive)),1-Math.exp(-2*Math.PI*clamp(params.bumpHz??80,40,200)/rate),1-Math.exp(-2*Math.PI*Math.min(clamp(params.tone??8000,1000,18000),rate*.45)/rate),clamp(params.bump??.4,0,1),0]);
          this.device.queue.writeBuffer(uniform,0,data);
          const pipeline = this.pipelines[entry];
          // Auto layouts omit bindings unused by each entry point.
          const used:Record<string,number[]> = {tiles:[0,1,2,3],scan:[0,3,4],apply:[0,2,3,4,5],finish:[0,1,2,4],save:[0,4,5]};
          const all=[uniform,input,local,source,target,this.state];
          const bind=this.device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:used[entry].map(binding=>({binding,resource:{buffer:all[binding]}}))});
          const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(count);pass.end();
        };
        dispatch('tiles',0,sums,scratch,Math.ceil(groups/64));
        let source=sums,target=scratch;
        for(let stride=1;stride<groups;stride*=2){dispatch('scan',stride,source,target,Math.ceil(groups/64));[source,target]=[target,source];}
        dispatch('apply',0,source,target,Math.ceil(n/256));
        dispatch('finish',0,source,target,Math.ceil(n/256));
        dispatch('save',0,source,target,1);
        encoder.copyBufferToBuffer(local,0,input,0,bytes);
      }
      encoder.copyBufferToBuffer(local,0,read,0,bytes);this.device.queue.submit([encoder.finish()]);
      scopePending = false;
      const validation = await this.device.popErrorScope();
      if (validation) throw new Error(`WebGPU validation: ${validation.message}`);
      await read.mapAsync(GPUMapMode.READ);
      const result = new Float32Array(read.getMappedRange().slice(0)); read.unmap(); return result;
    } finally {
      if (scopePending) await this.device.popErrorScope();
      for(const buffer of buffers) buffer.destroy(); this.busy=false;
    }
  }
}
