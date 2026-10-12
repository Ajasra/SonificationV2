/// <reference types="@webgpu/types" />
import { LUT_LINEAR_8 } from '../fast-lut.ts';

const imageShader = `
struct Size {width:u32,height:u32,pad:vec2<u32>}
@group(0) @binding(0) var image:texture_2d<f32>;
@group(0) @binding(1) var<storage,read_write> samples:array<f32>;
@group(0) @binding(2) var<storage,read> lut:array<f32>;
@group(0) @binding(3) var<uniform> size:Size;
@compute @workgroup_size(256) fn encode(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=size.width*size.height){return;}
 let rgb=textureLoad(image,vec2<i32>(i32(i%size.width),i32(i/size.width)),0).rgb;
 let bytes=vec3<u32>(round(clamp(rgb,vec3<f32>(0.0),vec3<f32>(1.0))*255.0));
 samples[i*3u]=lut[bytes.r];samples[i*3u+1u]=lut[bytes.g];samples[i*3u+2u]=lut[bytes.b];
}
`;
const displayShader = `
struct Size {width:u32,height:u32,pad:vec2<u32>}
@group(0) @binding(0) var<storage,read> samples:array<f32>;
@group(0) @binding(1) var<uniform> size:Size;
@vertex fn vertex(@builtin(vertex_index) i:u32)->@builtin(position) vec4<f32>{
 let p=array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0),vec2<f32>(3.0,-1.0),vec2<f32>(-1.0,3.0));return vec4<f32>(p[i],0.0,1.0);
}
@fragment fn fragment(@builtin(position) p:vec4<f32>)->@location(0) vec4<f32>{
 let i=(u32(p.y)*size.width+u32(p.x))*3u;
 let rgb=vec3<f32>(samples[i],samples[i+1u],samples[i+2u]);
 return vec4<f32>(floor(clamp((rgb+1.0)*127.5,vec3<f32>(0.0),vec3<f32>(255.0)))/255.0,1.0);
}
`;
const byteShader = `
struct Size {width:u32,height:u32,pad:vec2<u32>}
@group(0) @binding(0) var<storage,read> rgba:array<u32>;
@group(0) @binding(1) var<storage,read_write> samples:array<f32>;
@group(0) @binding(2) var<storage,read> lut:array<f32>;
@group(0) @binding(3) var<uniform> size:Size;
@compute @workgroup_size(256) fn encode(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;if(i>=size.width*size.height){return;}let pixel=rgba[i];
 samples[i*3u]=lut[pixel&255u];samples[i*3u+1u]=lut[(pixel>>8u)&255u];samples[i*3u+2u]=lut[(pixel>>16u)&255u];
}
`;
const gatherShader = `
@group(0) @binding(0) var<storage,read> samples:array<f32>;
@group(0) @binding(1) var<storage,read_write> compact:array<f32>;
@compute @workgroup_size(256) fn gather(@builtin(global_invocation_id) id:vec3<u32>){
 let i=id.x;let n=arrayLength(&samples);
 if(i<4096u){let index=i*max(1u,n/4096u);compact[i]=0.0;if(index<n){compact[i]=samples[index];}}
 else if(i<6144u){let index=i-4096u;compact[i]=0.0;if(index<n){compact[i]=samples[index];}}
}
`;

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
var<workgroup> prefix:array<vec2<f32>,256>;
@compute @workgroup_size(256) fn tiles(@builtin(workgroup_id) group:vec3<u32>,@builtin(local_invocation_index) lane:u32){
 let g=group.x;let i=g*256u+lane;let a=select(p.bumpA,p.toneA,p.stage==1u);
 var v=vec2<f32>(1.0,0.0);if(i<p.n){v=vec2<f32>(1.0-a,a*value(i));}
 prefix[lane]=v;workgroupBarrier();
 for(var stride=1u;stride<256u;stride*=2u){
  v=prefix[lane];if(lane>=stride){let left=prefix[lane-stride];v=vec2<f32>(v.x*left.x,v.y+v.x*left.y);}
  workgroupBarrier();prefix[lane]=v;workgroupBarrier();
 }
 if(i<p.n){local[i]=prefix[lane].y;}if(lane==255u){summaries[g]=prefix[lane];}
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
  lastDiagnosticInput: Float32Array | undefined;
  lastDiagnosticPixels: Uint8ClampedArray | undefined;
  lastTimings: Record<string, number> | undefined;
  readonly adapterInfo: GPUAdapterInfo;
  private busy = false;
  private disposed = false;
  private readonly state: GPUBuffer;
  private readonly pipelines: Record<string, GPUComputePipeline>;
  private imagePipeline!: GPUComputePipeline;
  private bytePipeline!: GPUComputePipeline;
  captureMode:'texture' | 'reference-bytes'='texture';
  private gatherPipeline!: GPUComputePipeline;
  private displayPipeline!: GPURenderPipeline;
  private pool:{buffer:GPUBuffer;size:number;usage:number}[]=[];
  private imageTexture:GPUTexture | undefined;
  private imageDimensions='';
  private diagnosticTexture:GPUTexture | undefined;
  private diagnosticDimensions='';
  private rasterCanvas:HTMLCanvasElement | undefined;
  private rasterContext:CanvasRenderingContext2D | undefined;
  private readonly lut:GPUBuffer;
  private readonly format = navigator.gpu.getPreferredCanvasFormat();
  private constructor(private readonly device: GPUDevice, adapter: GPUAdapter, pipelines: Record<string, GPUComputePipeline>) {
    this.adapterInfo = adapter.info; this.pipelines = pipelines;
    this.state = device.createBuffer({ size: 8, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST });
    this.lut=device.createBuffer({size:1024,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    device.queue.writeBuffer(this.lut,0,LUT_LINEAR_8 as Float32Array<ArrayBuffer>);
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
      const runtime = new WebGpuTapeSat(device, adapter, Object.fromEntries(entries));
      runtime.imagePipeline = await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:imageShader}),entryPoint:'encode'}});
      runtime.bytePipeline = await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:byteShader}),entryPoint:'encode'}});
      runtime.gatherPipeline = await device.createComputePipelineAsync({layout:'auto',compute:{module:device.createShaderModule({code:gatherShader}),entryPoint:'gather'}});
      const display = device.createShaderModule({code:displayShader});
      runtime.displayPipeline = await device.createRenderPipelineAsync({layout:'auto',vertex:{module:display,entryPoint:'vertex'},fragment:{module:display,entryPoint:'fragment',targets:[{format:runtime.format}]},primitive:{topology:'triangle-list'}});
      return runtime;
    } catch (error) { device.destroy(); throw error; }
  }
  reset(): void { if (this.busy || this.disposed) throw new Error('Backend unavailable'); this.device.queue.writeBuffer(this.state, 0, new Float32Array(2)); }
  dispose(): void { this.disposed = true; this.device.destroy(); }
  useReferenceBytes():void {if(this.busy || this.disposed)throw new Error('Backend unavailable');this.captureMode='reference-bytes';}
  configureCanvas(canvas: HTMLCanvasElement): GPUCanvasContext {
    if(this.disposed) throw new Error('Backend unavailable');
    const context=canvas.getContext('webgpu');
    if(!context) throw new Error('WebGPU canvas unavailable');
    context.configure({device:this.device,format:this.format,alphaMode:'opaque',colorSpace:'srgb',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_DST});
    return context;
  }
  async processImage(source: HTMLVideoElement | HTMLCanvasElement | ImageBitmap, context: GPUCanvasContext, params:Record<string,number>={}, profile=false, diagnostic=false, referenceRgba?:Uint8ClampedArray):Promise<Float32Array> {
    const canvas=context.canvas;
    if(!(canvas instanceof HTMLCanvasElement)) throw new Error('HTML canvas required');
    const width=canvas.width,height=canvas.height;
    const sourceWidth=source instanceof HTMLVideoElement ? source.videoWidth : source.width;
    const sourceHeight=source instanceof HTMLVideoElement ? source.videoHeight : source.height;
    if(sourceWidth!==width || sourceHeight!==height) throw new Error('Resident prototype requires source dimensions to match output; use a 1280×720 source.');
    if(this.busy || this.disposed)throw new Error('Backend unavailable');
    // Paused videos may have no importable GPU backing resource in Chromium.
    // Own the snapshot through GPU completion; never read its pixels into JS.
    const snapshotStarted=profile ? performance.now() : 0;
    const bitmap=source instanceof HTMLVideoElement ? await createImageBitmap(source) : undefined;
    const snapshotMs=profile ? performance.now()-snapshotStarted : 0;
    try {
      const rasterStarted=profile ? performance.now() : 0;
      if(!this.rasterCanvas){this.rasterCanvas=document.createElement('canvas');this.rasterContext=this.rasterCanvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'})??undefined;}
      if(!this.rasterContext)throw new Error('Reference RGBA raster canvas unavailable');
      if(this.rasterCanvas.width!==width)this.rasterCanvas.width=width;
      if(this.rasterCanvas.height!==height)this.rasterCanvas.height=height;
      this.rasterContext.drawImage(bitmap??source,0,0);
      const rgba=this.captureMode==='reference-bytes' ? referenceRgba??this.rasterContext.getImageData(0,0,width,height).data : undefined;
      if(rgba && rgba.length!==width*height*4)throw new Error('Reference RGBA size mismatch');
      const rasterMs=profile ? performance.now()-rasterStarted : 0;
      const result=await this.execute(undefined,params,44100,profile,{source:this.rasterCanvas,rgba,context,width,height,diagnostic});
      if(profile && this.lastTimings){this.lastTimings.gpuSourceSnapshotMs=snapshotMs;this.lastTimings.gpuRasterCaptureMs=rasterMs;}
      return result;
    }finally{bitmap?.close();}
  }
  async process(samples: Float32Array, params: Record<string, number> = {}, rate = 44100, profile = false): Promise<Float32Array> {
    return this.execute(samples,params,rate,profile);
  }
  private async execute(samples:Float32Array | undefined, params:Record<string,number>,rate:number,profile:boolean,resident?:{source:HTMLCanvasElement | HTMLVideoElement | ImageBitmap;rgba?:Uint8ClampedArray;context:GPUCanvasContext;width:number;height:number;diagnostic:boolean}):Promise<Float32Array> {
    if (this.busy || this.disposed) throw new Error('Backend unavailable');
    if (!Number.isFinite(rate) || rate <= 0 || Object.values(params).some(value => !Number.isFinite(value))) throw new Error('Invalid parameters');
    const n = resident ? resident.width*resident.height*3 : samples!.length;
    if (!n) return new Float32Array();
    const groups = Math.ceil(n / 256), bytes = n * 4;
    if (bytes * 2 > this.device.limits.maxStorageBufferBindingSize) throw new Error('Sample block exceeds device limits');
    this.busy = true;
    this.lastTimings = undefined;
    this.lastDiagnosticInput=undefined;this.lastDiagnosticPixels=undefined;
    const started = profile ? performance.now() : 0;
    let poolIndex=0;
    const buffer = (size: number, usage = GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST) => {
      const old=this.pool[poolIndex];
      const reusable=old && old.size===size && old.usage===usage;
      if(old && !reusable)old.buffer.destroy();
      const entry=reusable ? old : {buffer:this.device.createBuffer({size,usage}),size,usage};
      this.pool[poolIndex++]=entry;return entry.buffer;
    };
    this.device.pushErrorScope('validation');
    let scopePending = true;
    try {
      const input = buffer(bytes), local = buffer(bytes), sums = buffer(Math.max(groups * 8, bytes * 2)), scratch = buffer(Math.max(groups * 8, bytes * 2));
      const readBytes=resident && !resident.diagnostic ? 6144*4 : bytes;
      const read = buffer(readBytes, GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST);
      const rawRead=resident?.diagnostic ? buffer(bytes,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST) : undefined;
      const pixelPitch=resident ? Math.ceil(resident.width*4/256)*256 : 0;
      const pixelRead=resident?.diagnostic ? buffer(pixelPitch*resident.height,GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST) : undefined;
      if(samples) this.device.queue.writeBuffer(input, 0, samples as Float32Array<ArrayBuffer>);
      const clamp = (v:number, low:number, high:number) => Math.min(high, Math.max(low, v));
      const drive = clamp(params.drive ?? 2.5, 1, 10), bias = clamp(params.bias ?? .1, -.5, .5);
      const tanh = (z:number) => z < -3 ? -1 : z > 3 ? 1 : z*(27+z*z)/(27+9*z*z);
      const encoder = this.device.createCommandEncoder();
      let imageSize:GPUBuffer | undefined;
      if(resident){
        let imageResource:GPUTextureView | GPUBufferBinding;
        const pipeline=resident.rgba ? this.bytePipeline : this.imagePipeline;
        if(resident.rgba){
          const rgbaBuffer=buffer(resident.rgba.byteLength);
          this.device.queue.writeBuffer(rgbaBuffer,0,resident.rgba as Uint8ClampedArray<ArrayBuffer>);
          imageResource={buffer:rgbaBuffer};
        }else{
        const dimensions=`${resident.width}x${resident.height}`;
        if(!this.imageTexture || dimensions!==this.imageDimensions){this.imageTexture?.destroy();this.imageDimensions=dimensions;this.imageTexture=this.device.createTexture({size:[resident.width,resident.height],format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT});}
        const texture=this.imageTexture;
        this.device.queue.copyExternalImageToTexture({source:resident.source},{texture,colorSpace:'srgb',premultipliedAlpha:false},[resident.width,resident.height]);
        imageResource=texture.createView();
        }
        imageSize=buffer(16,GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST);
        this.device.queue.writeBuffer(imageSize,0,new Uint32Array([resident.width,resident.height,0,0]));
        const bind=this.device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:imageResource},{binding:1,resource:{buffer:input}},{binding:2,resource:{buffer:this.lut}},{binding:3,resource:{buffer:imageSize}}]});
        const pass=encoder.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(resident.width*resident.height/256));pass.end();
        if(rawRead)encoder.copyBufferToBuffer(input,0,rawRead,0,bytes);
      }
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
        dispatch('tiles',0,sums,scratch,groups);
        let source=sums,target=scratch;
        for(let stride=1;stride<groups;stride*=2){dispatch('scan',stride,source,target,Math.ceil(groups/64));[source,target]=[target,source];}
        dispatch('apply',0,source,target,Math.ceil(n/256));
        dispatch('finish',0,source,target,Math.ceil(n/256));
        dispatch('save',0,source,target,1);
        encoder.copyBufferToBuffer(local,0,input,0,bytes);
      }
      if(resident){
        const bind=this.device.createBindGroup({layout:this.displayPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:local}},{binding:1,resource:{buffer:imageSize!}}]});
        const canvasTexture=resident.context.getCurrentTexture();
        let renderTexture=canvasTexture;
        if(resident.diagnostic){
          const dimensions=`${resident.width}x${resident.height}`;
          if(!this.diagnosticTexture || this.diagnosticDimensions!==dimensions){this.diagnosticTexture?.destroy();this.diagnosticDimensions=dimensions;this.diagnosticTexture=this.device.createTexture({size:[resident.width,resident.height],format:this.format,usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});}
          renderTexture=this.diagnosticTexture;
        }
        const render=encoder.beginRenderPass({colorAttachments:[{view:renderTexture.createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});
        render.setPipeline(this.displayPipeline);render.setBindGroup(0,bind);render.draw(3);render.end();
        if(pixelRead){
          encoder.copyTextureToBuffer({texture:renderTexture},{buffer:pixelRead,bytesPerRow:pixelPitch},[resident.width,resident.height]);
          encoder.copyTextureToTexture({texture:renderTexture},{texture:canvasTexture},[resident.width,resident.height]);
        }
      }
      if(resident && !resident.diagnostic){
        const compact=buffer(readBytes);
        const bind=this.device.createBindGroup({layout:this.gatherPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:local}},{binding:1,resource:{buffer:compact}}]});
        const pass=encoder.beginComputePass();pass.setPipeline(this.gatherPipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(24);pass.end();
        encoder.copyBufferToBuffer(compact,0,read,0,readBytes);
      }else encoder.copyBufferToBuffer(local,0,read,0,bytes);
      this.device.queue.submit([encoder.finish()]);
      const submitted = profile ? performance.now() : 0;
      scopePending = false;
      const validation = await this.device.popErrorScope();
      if (validation) throw new Error(`WebGPU validation: ${validation.message}`);
      await read.mapAsync(GPUMapMode.READ);
      const mapped = profile ? performance.now() : 0;
      const result = new Float32Array(read.getMappedRange().slice(0)); read.unmap();
      if(rawRead && pixelRead && resident){
        await Promise.all([rawRead.mapAsync(GPUMapMode.READ),pixelRead.mapAsync(GPUMapMode.READ)]);
        this.lastDiagnosticInput=new Float32Array(rawRead.getMappedRange().slice(0));rawRead.unmap();
        const mappedPixels=new Uint8Array(pixelRead.getMappedRange());
        const rgba=new Uint8ClampedArray(resident.width*resident.height*4);
        const bgra=this.format.startsWith('bgra');
        for(let y=0;y<resident.height;y++)for(let x=0;x<resident.width;x++){
          const source=y*pixelPitch+x*4,target=(y*resident.width+x)*4;
          rgba[target]=mappedPixels[source+(bgra?2:0)];rgba[target+1]=mappedPixels[source+1];rgba[target+2]=mappedPixels[source+(bgra?0:2)];rgba[target+3]=mappedPixels[source+3];
        }
        pixelRead.unmap();this.lastDiagnosticPixels=rgba;
      }
      if (profile) this.lastTimings = { gpuPrepareSubmitMs: submitted-started, gpuValidationCompletionMapMs: mapped-submitted, gpuMappedCopyMs: performance.now()-mapped };
      return result;
    } finally {
      if (scopePending) await this.device.popErrorScope();
      for(const entry of this.pool.splice(poolIndex))entry.buffer.destroy();this.busy=false;
    }
  }
}
