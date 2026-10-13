/// <reference types="@webgpu/types" />

const shader = `
struct Params { values: array<f32, 6> }
@group(0) @binding(0) var<storage, read_write> pixels: array<u32>;
@group(0) @binding(1) var<storage, read_write> trail: array<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i=id.x;if(i>=arrayLength(&pixels)){return;}
  let pixel=pixels[i];let r=f32(pixel&255u);let g=f32((pixel>>8u)&255u);let b=f32((pixel>>16u)&255u);let a=(pixel>>24u)&255u;
  let luma=(u32(r)*77u+u32(g)*150u+u32(b)*29u)>>8u;
  var tr=trail[i*3u]*params.values[0];var tg=trail[i*3u+1u]*params.values[0];var tb=trail[i*3u+2u]*params.values[0];
  if(f32(luma)>params.values[1]){
    let excess=(f32(luma)-params.values[1])*params.values[2];
    tr=max(tr,r*excess);tg=max(tg,g*excess);tb=max(tb,b*excess);
  }
  trail[i*3u]=tr;trail[i*3u+1u]=tg;trail[i*3u+2u]=tb;
  let rr=clamp(i32(r+tr*params.values[3]+0.5),0,255);let gg=clamp(i32(g+tg*params.values[4]+0.5),0,255);let bb=clamp(i32(b+tb*params.values[5]+0.5),0,255);
  pixels[i]=u32(rr)|(u32(gg)<<8u)|(u32(bb)<<16u)|(a<<24u);
}`;

export interface VidiconParams { decay:number; threshold:number; glowGain:number; tint:number }

export class WebGpuVidicon {
  private readonly device:GPUDevice;
  private readonly pipeline:GPUComputePipeline;
  private readonly paramsBuffer:GPUBuffer;
  private pixels?:GPUBuffer;
  private trail?:GPUBuffer;
  private readback?:GPUBuffer;
  private width=0;
  private height=0;
  private disposed=false;

  private constructor(device:GPUDevice){
    this.device=device;
    this.pipeline=device.createComputePipeline({layout:'auto',compute:{module:device.createShaderModule({code:shader}),entryPoint:'main'}});
    this.paramsBuffer=device.createBuffer({size:32,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});
  }
  static async create():Promise<WebGpuVidicon>{
    if(!navigator.gpu)throw new Error('WebGPU unavailable');const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error('WebGPU adapter unavailable');return new WebGpuVidicon(await adapter.requestDevice());
  }
  reset(width:number,height:number):void{
    if(this.disposed)throw new Error('WebGPU Vidicon disposed');const bytes=width*height*4,trailBytes=width*height*3*4;
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<=0||height<=0)throw new Error('Invalid Vidicon dimensions');
    this.pixels?.destroy();this.trail?.destroy();this.readback?.destroy();this.width=width;this.height=height;
    this.pixels=this.device.createBuffer({size:bytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
    this.trail=this.device.createBuffer({size:trailBytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
    this.readback=this.device.createBuffer({size:bytes,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
  }
  async processFrame(rgba:Uint8ClampedArray,width:number,height:number,params:VidiconParams):Promise<Uint8ClampedArray>{
    if(this.disposed)throw new Error('WebGPU Vidicon disposed');const bytes=width*height*4;if(rgba.length!==bytes)throw new Error('Vidicon input dimensions mismatch');
    if(width!==this.width||height!==this.height)this.reset(width,height);
    let tr=1,tg=1,tb=1;if(params.tint===1){tr=.78;tg=1;tb=.4;}else if(params.tint===2){tr=1;tg=.75;tb=.45;}
    this.device.queue.writeBuffer(this.paramsBuffer,0,new Float32Array([params.decay,params.threshold,params.glowGain/255,tr,tg,tb]));
    this.device.queue.writeBuffer(this.pixels!,0,rgba.buffer,rgba.byteOffset,bytes);
    const bind=this.device.createBindGroup({layout:this.pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.pixels!}},{binding:1,resource:{buffer:this.trail!}},{binding:2,resource:{buffer:this.paramsBuffer}}]});
    const encoder=this.device.createCommandEncoder(),pass=encoder.beginComputePass();pass.setPipeline(this.pipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(width*height/256));pass.end();encoder.copyBufferToBuffer(this.pixels!,0,this.readback!,0,bytes);this.device.queue.submit([encoder.finish()]);
    await this.readback!.mapAsync(GPUMapMode.READ);const output=new Uint8ClampedArray(this.readback!.getMappedRange().slice(0));this.readback!.unmap();return output;
  }
  dispose():void{if(this.disposed)return;this.disposed=true;this.pixels?.destroy();this.trail?.destroy();this.readback?.destroy();this.paramsBuffer.destroy();this.device.destroy();}
}
