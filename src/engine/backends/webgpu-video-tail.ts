/// <reference types="@webgpu/types" />
import type { VideoFrameContext, VideoFilterNodeConfig } from '../../types/index.ts';
import { ProcAmpFilter } from '../video-filters/color/procamp.ts';
import { SolarizerFilter } from '../video-filters/color/solarizer.ts';
import { ColorizerFilter } from '../video-filters/color/colorizer.ts';
import { CviSlicerFilter } from '../video-filters/color/cvislicer.ts';
import { DifferentiatorFilter } from '../video-filters/raster/differentiator.ts';
import { ScanimateFilter } from '../video-filters/raster/scanimate.ts';

const procampShader=`struct P{v:array<f32,12>} @group(0) @binding(0) var<storage,read_write> px:array<u32>; @group(0) @binding(1) var<uniform> p:P;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=arrayLength(&px)){return;}let q=px[i];let r=f32(q&255u);let g=f32((q>>8u)&255u);let b=f32((q>>16u)&255u);let a=(q>>24u)&255u;let y=.299*r+.587*g+.114*b;let ny=clamp((y-16.0)*p.v[0]+16.0+p.v[1],0.0,p.v[2]);let rr=clamp(i32(ny+r*p.v[3]+g*p.v[4]+b*p.v[5]+.5),0,255);let gg=clamp(i32(ny+r*p.v[6]+g*p.v[7]+b*p.v[8]+.5),0,255);let bb=clamp(i32(ny+r*p.v[9]+g*p.v[10]+b*p.v[11]+.5),0,255);px[i]=u32(rr)|(u32(gg)<<8u)|(u32(bb)<<16u)|(a<<24u);}`;
const lutShader=`@group(0) @binding(0) var<storage,read_write> px:array<u32>; @group(0) @binding(1) var<storage,read> lut:array<u32>; @compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=arrayLength(&px)){return;}let q=px[i];px[i]=lut[q&255u]|(lut[(q>>8u)&255u]<<8u)|(lut[(q>>16u)&255u]<<16u)|(q&0xff000000u);}`;
const colorShader=`@group(0) @binding(0) var<storage,read_write> px:array<u32>; @group(0) @binding(1) var<storage,read> lut:array<u32>;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=arrayLength(&px)){return;}let q=px[i];let r=q&255u;let g=(q>>8u)&255u;let b=(q>>16u)&255u;let a=q&0xff000000u;let y=(r*77u+g*150u+b*29u)>>8u;let base=(r*256u+y)*3u;let greenBase=(g*256u+y)*3u;let blueBase=(b*256u+y)*3u;px[i]=lut[base]|(lut[greenBase+1u]<<8u)|(lut[blueBase+2u]<<16u)|a;}`;
const cviShader=`struct P{width:u32,height:u32,threshold:u32,pad:u32} @group(0) @binding(0) var<storage,read> src:array<u32>; @group(0) @binding(1) var<storage,read_write> dst:array<u32>; @group(0) @binding(2) var<storage,read> quant:array<u32>; @group(0) @binding(3) var<storage,read> edge:array<u32>; @group(0) @binding(4) var<storage,read> blend:array<u32>; @group(0) @binding(5) var<uniform> p:P;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=p.width*p.height){return;}let q=src[i];let r=q&255u;let g=(q>>8u)&255u;let b=(q>>16u)&255u;let y=(r*77u+g*150u+b*29u)>>8u;let x=i%p.width;var prev=y;if(x>0u){let v=src[i-1u];prev=((v&255u)*77u+((v>>8u)&255u)*150u+((v>>16u)&255u)*29u)>>8u;}let delta=select(prev-y,y-prev,y>prev);let pal=select(quant[y],edge[y],delta>p.threshold);dst[i]=blend[r*256u+(pal&255u)]|(blend[g*256u+((pal>>8u)&255u)]<<8u)|(blend[b*256u+((pal>>16u)&255u)]<<16u)|(q&0xff000000u);}`;
const differentiatorShader=`struct P{width:u32,height:u32,first:u32,pad:u32} @group(0) @binding(0) var<storage,read> src:array<u32>; @group(0) @binding(1) var<storage,read_write> dst:array<u32>; @group(0) @binding(2) var<storage,read> lut:array<u32>; @group(0) @binding(3) var<uniform> p:P;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=p.width*p.height){return;}let q=src[i];let x=i%p.width;if(x==0u){dst[i]=p.first|(p.first<<8u)|(p.first<<16u)|(q&0xff000000u);return;}let prev=src[i-1u];let r=i32(q&255u)-i32(prev&255u);let g=i32((q>>8u)&255u)-i32((prev>>8u)&255u);let b=i32((q>>16u)&255u)-i32((prev>>16u)&255u);dst[i]=lut[u32(r+255)]|(lut[u32(g+255)]<<8u)|(lut[u32(b+255)]<<16u)|(q&0xff000000u);}`;
const scanScatterShader=`struct P{width:u32,height:u32,density:u32,rows:u32} @group(0) @binding(0) var<storage,read> src:array<u32>; @group(0) @binding(1) var<storage,read_write> accum:array<atomic<u32>>; @group(0) @binding(2) var<storage,read> table:array<u32>; @group(0) @binding(3) var<uniform> p:P;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3<u32>){let n=id.x;if(n>=p.width*p.rows){return;}let x=n%p.width;let baseY=(n/p.width)*p.density;let q=src[baseY*p.width+x];let luma=((q&255u)*77u+((q>>8u)&255u)*150u+((q>>16u)&255u)*29u)>>8u;let targetY=i32(baseY)+bitcast<i32>(table[luma]);if(targetY<0||targetY>=i32(p.height)){return;}let target=(u32(targetY)*p.width+x)*3u;let t=256u+luma*3u;atomicAdd(&accum[target],table[t]);atomicAdd(&accum[target+1u],table[t+1u]);atomicAdd(&accum[target+2u],table[t+2u]);if(targetY>0){let above=target-p.width*3u;let glow=1024u+luma*3u;atomicAdd(&accum[above],table[glow]);atomicAdd(&accum[above+1u],table[glow+1u]);atomicAdd(&accum[above+2u],table[glow+2u]);}if(targetY<i32(p.height)-1){let below=target+p.width*3u;let glow=1024u+luma*3u;atomicAdd(&accum[below],table[glow]);atomicAdd(&accum[below+1u],table[glow+1u]);atomicAdd(&accum[below+2u],table[glow+2u]);}}`;
const scanBlendShader=`struct P{width:u32,height:u32,pad:vec2<u32>} @group(0) @binding(0) var<storage,read> src:array<u32>; @group(0) @binding(1) var<storage,read> accum:array<atomic<u32>>; @group(0) @binding(2) var<storage,read> blend:array<u32>; @group(0) @binding(3) var<storage,read_write> dst:array<u32>; @group(0) @binding(4) var<uniform> p:P;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=p.width*p.height){return;}let q=src[i];let base=i*3u;let r=min(atomicLoad(&accum[base]),255u);let g=min(atomicLoad(&accum[base+1u]),255u);let b=min(atomicLoad(&accum[base+2u]),255u);let lr=(q&255u)*256u+r;let lg=((q>>8u)&255u)*256u+g;let lb=((q>>16u)&255u)*256u+b;dst[i]=blend[lr]|(blend[lg]<<8u)|(blend[lb]<<16u)|(q&0xff000000u);}`;
const displayShader=`struct Size{width:u32,height:u32,pad:vec2<u32>} @group(0) @binding(0) var<storage,read> px:array<u32>; @group(0) @binding(1) var<uniform> size:Size;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4<f32>{let p=array<vec2<f32>,3>(vec2<f32>(-1.0,-1.0),vec2<f32>(3.0,-1.0),vec2<f32>(-1.0,3.0));return vec4<f32>(p[i],0.0,1.0);}
@fragment fn fs(@builtin(position) pos:vec4<f32>)->@location(0) vec4<f32>{let i=u32(pos.y)*size.width+u32(pos.x);let q=px[i];return vec4<f32>(f32(q&255u),f32((q>>8u)&255u),f32((q>>16u)&255u),f32((q>>24u)&255u))/255.0;}`;
const sourceShader=`@group(0) @binding(0) var source:texture_2d<f32>; @group(0) @binding(1) var<storage,read_write> px:array<u32>; @group(0) @binding(2) var<uniform> size:vec2<u32>;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3<u32>){let i=id.x;if(i>=size.x*size.y){return;}let p=textureLoad(source,vec2<i32>(i32(i%size.x),i32(i/size.x)),0);let c=vec4<u32>(round(clamp(p,vec4<f32>(0.0),vec4<f32>(1.0))*255.0));px[i]=c.r|(c.g<<8u)|(c.b<<16u)|(c.a<<24u);}`;

type NodeGpu={signature:string;parameter:GPUBuffer;lut?:GPUBuffer;edgeLut?:GPUBuffer;blendLut?:GPUBuffer;audioLevelKey?:number;group:GPUBindGroup;pipeline:GPUComputePipeline;secondParameter?:GPUBuffer;secondGroup?:GPUBindGroup;secondPipeline?:GPUComputePipeline;auxiliary?:GPUBuffer};
function procampValues(config:VideoFilterNodeConfig,context:VideoFrameContext):Float32Array<ArrayBuffer>{
  const filter=new ProcAmpFilter();filter.setParams(config.params);const params=filter.getParams();let gain=params.videoGain;
  if(context.audioPeak&&context.audioPeak>.05)gain+=context.audioPeak*.4;
  const sat=params.saturation,phase=params.chromaPhase*Math.PI/180,cos=Math.cos(phase)*sat,sin=Math.sin(phase)*sat;
  const ur=-.14713,ug=-.28886,ub=.436,vr=.615,vg=-.51499,vb=-.10001,nur=ur*cos-vr*sin,nug=ug*cos-vg*sin,nub=ub*cos-vb*sin,nvr=ur*sin+vr*cos,nvg=ug*sin+vr*cos,nvb=ub*sin+vr*cos;
  return new Float32Array([gain,params.pedestal,params.whiteClip,1.13983*nvr,1.13983*nvg,1.13983*nvb,-.39465*nur-.58060*nvr,-.39465*nug-.58060*nvg,-.39465*nub-.58060*nvb,2.03211*nur,2.03211*nug,2.03211*nub]);
}
export class WebGpuVideoTail {
  private readonly device:GPUDevice;
  private readonly context:GPUCanvasContext;
  private readonly pixels:GPUBuffer;
  private readonly scratch:GPUBuffer;
  private readonly readback:GPUBuffer;
  private readonly size:GPUBuffer;
  private readonly displayPipeline:GPURenderPipeline;
  private readonly displayGroup:GPUBindGroup;
  private readonly sourcePipeline:GPUComputePipeline;
  private readonly sourceTexture:GPUTexture;
  private readonly sourceSize:GPUBuffer;
  private readonly nodes=new Map<string,NodeGpu>();
  private disposed=false;
  private constructor(device:GPUDevice,canvas:HTMLCanvasElement,width:number,height:number,private readonly ownsDevice:boolean){
    this.device=device;canvas.width=width;canvas.height=height;
    const context=canvas.getContext('webgpu');if(!context)throw new Error('WebGPU canvas context unavailable');this.context=context;
    context.configure({device,format:navigator.gpu.getPreferredCanvasFormat(),alphaMode:'opaque',usage:GPUTextureUsage.RENDER_ATTACHMENT});
    const bytes=width*height*4;this.pixels=device.createBuffer({size:bytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});this.scratch=device.createBuffer({size:bytes,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC});
    this.readback=device.createBuffer({size:bytes,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST});
    this.size=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(this.size,0,new Uint32Array([width,height,0,0]));
    this.displayPipeline=device.createRenderPipeline({layout:'auto',vertex:{module:device.createShaderModule({code:displayShader}),entryPoint:'vs'},fragment:{module:device.createShaderModule({code:displayShader}),entryPoint:'fs',targets:[{format:navigator.gpu.getPreferredCanvasFormat()}]},primitive:{topology:'triangle-list'}});
    this.displayGroup=device.createBindGroup({layout:this.displayPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.pixels}},{binding:1,resource:{buffer:this.size}}]});
    this.sourcePipeline=device.createComputePipeline({layout:'auto',compute:{module:device.createShaderModule({code:sourceShader}),entryPoint:'main'}});
    this.sourceTexture=device.createTexture({size:[width,height],format:'rgba8unorm',usage:GPUTextureUsage.COPY_DST|GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT});
    this.sourceSize=device.createBuffer({size:8,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(this.sourceSize,0,new Uint32Array([width,height]));
  }
  static async create(canvas:HTMLCanvasElement,width:number,height:number,sharedDevice?:GPUDevice):Promise<WebGpuVideoTail>{
    if(sharedDevice)return new WebGpuVideoTail(sharedDevice,canvas,width,height,false);
    if(!navigator.gpu)throw new Error('WebGPU unavailable');const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw new Error('WebGPU adapter unavailable');return new WebGpuVideoTail(await adapter.requestDevice(),canvas,width,height,true);
  }
  private prepareNode(config:VideoFilterNodeConfig,context:VideoFrameContext):NodeGpu{
    const device=this.device;const signature=JSON.stringify([config.type,config.params]);let node=this.nodes.get(config.id),audioLevelKey:number|undefined;
    if(node&&node.signature===signature){
      if(config.type==='procamp')device.queue.writeBuffer(node.parameter,0,procampValues(config,context));
      if(config.type==='cvislicer'){
        const filter=new CviSlicerFilter();filter.setParams(config.params);const audioRms=context.audioRms??0;const levelKey=audioRms>0.1?Math.max(2,Math.min(16,Math.round(filter.levels-audioRms*3))):filter.levels;
        if(node.audioLevelKey!==levelKey){const tables=filter.getGpuLookupTables(audioRms);device.queue.writeBuffer(node.lut!,0,tables.quant as Uint32Array<ArrayBuffer>);device.queue.writeBuffer(node.edgeLut!,0,tables.edge as Uint32Array<ArrayBuffer>);node.audioLevelKey=levelKey;}
      }
      return node;
    }
    if(node){node.parameter.destroy();if(node.lut!==node.parameter)node.lut?.destroy();node.edgeLut?.destroy();node.blendLut?.destroy();node.secondParameter?.destroy();node.auxiliary?.destroy();}
    let pipeline:GPUComputePipeline,parameter:GPUBuffer,lut:GPUBuffer|undefined,edgeLut:GPUBuffer|undefined,blendLut:GPUBuffer|undefined,group:GPUBindGroup,secondPipeline:GPUComputePipeline|undefined,secondGroup:GPUBindGroup|undefined,secondParameter:GPUBuffer|undefined,auxiliary:GPUBuffer|undefined;
    if(config.type==='procamp'){
      const values=procampValues(config,context);
      parameter=device.createBuffer({size:48,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(parameter,0,values);
      pipeline=device.createComputePipeline({layout:'auto',compute:{module:device.createShaderModule({code:procampShader}),entryPoint:'main'}});
      group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.pixels}},{binding:1,resource:{buffer:parameter}}]});
    }else if(config.type==='solarizer'){
      const filter=new SolarizerFilter();filter.setParams(config.params);const values=Uint32Array.from(filter.getLut());
      lut=device.createBuffer({size:1024,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(lut,0,values as Uint32Array<ArrayBuffer>);
      parameter=lut;pipeline=device.createComputePipeline({layout:'auto',compute:{module:device.createShaderModule({code:lutShader}),entryPoint:'main'}});
      group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.pixels}},{binding:1,resource:{buffer:lut}}]});
    }else if(config.type==='colorizer'){
      const filter=new ColorizerFilter();filter.setParams(config.params);const values=filter.getPackedColorLut();
      const params=filter.getParams(),blendLut=new Uint32Array(256*256*3),wet=params.mix,dry=1-wet;
      for(let original=0;original<256;original++)for(let y=0;y<256;y++){
        const colors=values[y]!,offset=(original*256+y)*3;
        blendLut[offset]=(original*dry+(colors&255)*wet+.5)|0;
        blendLut[offset+1]=(original*dry+((colors>>8)&255)*wet+.5)|0;
        blendLut[offset+2]=(original*dry+((colors>>16)&255)*wet+.5)|0;
      }
      lut=device.createBuffer({size:blendLut.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(lut,0,blendLut as Uint32Array<ArrayBuffer>);
      parameter=lut;
      pipeline=device.createComputePipeline({layout:'auto',compute:{module:device.createShaderModule({code:colorShader}),entryPoint:'main'}});
      group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.pixels}},{binding:1,resource:{buffer:lut}}]});
    }else if(config.type==='cvislicer'){
      const filter=new CviSlicerFilter();filter.setParams(config.params);const audioRms=context.audioRms??0;audioLevelKey=audioRms>0.1?Math.max(2,Math.min(16,Math.round(filter.levels-audioRms*3))):filter.levels;const tables=filter.getGpuLookupTables(audioRms);
      lut=device.createBuffer({size:1024,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(lut,0,tables.quant as Uint32Array<ArrayBuffer>);
      edgeLut=device.createBuffer({size:1024,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(edgeLut,0,tables.edge as Uint32Array<ArrayBuffer>);
      const blend=new Uint32Array(256*256),dry=1-filter.mix;for(let original=0;original<256;original++)for(let palette=0;palette<256;palette++)blend[original*256+palette]=(original*dry+palette*filter.mix+.5)|0;
      blendLut=device.createBuffer({size:blend.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(blendLut,0,blend as Uint32Array<ArrayBuffer>);
      parameter=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(parameter,0,new Uint32Array([context.width,context.height,filter.edgeThresh,0]));
      pipeline=device.createComputePipeline({layout:'auto',compute:{module:device.createShaderModule({code:cviShader}),entryPoint:'main'}});
      group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.scratch}},{binding:1,resource:{buffer:this.pixels}},{binding:2,resource:{buffer:lut}},{binding:3,resource:{buffer:edgeLut}},{binding:4,resource:{buffer:blendLut}},{binding:5,resource:{buffer:parameter}}]});
    }else if(config.type==='differentiator'){
      const filter=new DifferentiatorFilter();filter.setParams(config.params);const values=new Uint32Array(511),isBipolar=filter.bipolar>0.5,invert=filter.invert>0.5;
      for(let diff=-255;diff<=255;diff++){let value=(invert?-diff:diff)*filter.gain;value=isBipolar?128+value+filter.bias:Math.abs(value)+filter.bias;values[diff+255]=value<0?0:value>255?255:value|0;}
      lut=device.createBuffer({size:values.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(lut,0,values as Uint32Array<ArrayBuffer>);
      parameter=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(parameter,0,new Uint32Array([context.width,context.height,isBipolar?128:0,0]));
      pipeline=device.createComputePipeline({layout:'auto',compute:{module:device.createShaderModule({code:differentiatorShader}),entryPoint:'main'}});
      group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.scratch}},{binding:1,resource:{buffer:this.pixels}},{binding:2,resource:{buffer:lut}},{binding:3,resource:{buffer:parameter}}]});
    }else if(config.type==='scanimate'){
      const filter=new ScanimateFilter();filter.setParams(config.params);const table=new Uint32Array(1792);let defScale=filter.deflection/128;if(context.audioPeak&&context.audioPeak>0.05)defScale+=(context.audioPeak-0.05)*0.4;
      for(let luma=0;luma<256;luma++)table[luma]=Math.round((luma-128)*defScale)>>>0;
      const colors=filter.phosphor===1?[30,230,255]:filter.phosphor===2?[255,170,30]:filter.phosphor===3?[230,240,255]:[40,255,60];
      for(let luma=0;luma<256;luma++){const intensity=(luma/255)*filter.beamGlow;for(let c=0;c<3;c++){table[256+luma*3+c]=colors[c]!*intensity|0;table[1024+luma*3+c]=colors[c]!*intensity*0.35|0;}}
      lut=device.createBuffer({size:table.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(lut,0,table as Uint32Array<ArrayBuffer>);
      const blend=new Uint32Array(256*256),wet=filter.mix,dry=1-wet;for(let original=0;original<256;original++)for(let processed=0;processed<256;processed++)blend[original*256+processed]=(original*dry+processed*wet)|0;
      blendLut=device.createBuffer({size:blend.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(blendLut,0,blend as Uint32Array<ArrayBuffer>);
      const rows=Math.ceil(context.height/filter.density);auxiliary=device.createBuffer({size:context.width*context.height*3*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
      parameter=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(parameter,0,new Uint32Array([context.width,context.height,filter.density,rows]));
      pipeline=device.createComputePipeline({layout:'auto',compute:{module:device.createShaderModule({code:scanScatterShader}),entryPoint:'main'}});
      group=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.pixels}},{binding:1,resource:{buffer:auxiliary}},{binding:2,resource:{buffer:lut}},{binding:3,resource:{buffer:parameter}}]});
      secondParameter=device.createBuffer({size:16,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});device.queue.writeBuffer(secondParameter,0,new Uint32Array([context.width,context.height,0,0]));
      secondPipeline=device.createComputePipeline({layout:'auto',compute:{module:device.createShaderModule({code:scanBlendShader}),entryPoint:'main'}});
      secondGroup=device.createBindGroup({layout:secondPipeline.getBindGroupLayout(0),entries:[{binding:0,resource:{buffer:this.scratch}},{binding:1,resource:{buffer:auxiliary}},{binding:2,resource:{buffer:blendLut}},{binding:3,resource:{buffer:this.pixels}},{binding:4,resource:{buffer:secondParameter}}]});
    }else throw new Error(`Unsupported GPU video filter ${config.type}`);
    node={signature,parameter,lut,edgeLut,blendLut,audioLevelKey,group,pipeline,secondParameter,secondGroup,secondPipeline,auxiliary};this.nodes.set(config.id,node);return node;
  }
  async process(rgba:Uint8ClampedArray,configs:VideoFilterNodeConfig[],context:VideoFrameContext,diagnosticReadback=false):Promise<Uint8Array|undefined>{
    if(rgba.length!==this.pixels.size)throw new Error('GPU video input length mismatch');
    return this.processInput(rgba,undefined,configs,context,diagnosticReadback);
  }
  async processSource(source:HTMLCanvasElement,configs:VideoFilterNodeConfig[],context:VideoFrameContext,diagnosticReadback=false):Promise<Uint8Array|undefined>{
    return this.processInput(undefined,source,configs,context,diagnosticReadback);
  }
  private async processInput(rgba:Uint8ClampedArray|undefined,source:HTMLCanvasElement|undefined,configs:VideoFilterNodeConfig[],context:VideoFrameContext,diagnosticReadback:boolean):Promise<Uint8Array|undefined>{
    if(this.disposed)throw new Error('GPU video tail disposed');
    if(!rgba&&!source)throw new Error('GPU video input is missing');
    if(source){
      this.device.queue.copyExternalImageToTexture({source},{texture:this.sourceTexture,colorSpace:'srgb',premultipliedAlpha:false},[context.width,context.height]);
    }else this.device.queue.writeBuffer(this.pixels,0,rgba!.buffer,rgba!.byteOffset,rgba!.byteLength);
    const encoder=this.device.createCommandEncoder();
    if(source){const bind=this.device.createBindGroup({layout:this.sourcePipeline.getBindGroupLayout(0),entries:[{binding:0,resource:this.sourceTexture.createView()},{binding:1,resource:{buffer:this.pixels}},{binding:2,resource:{buffer:this.sourceSize}}]});const pass=encoder.beginComputePass();pass.setPipeline(this.sourcePipeline);pass.setBindGroup(0,bind);pass.dispatchWorkgroups(Math.ceil(context.width*context.height/256));pass.end();}
    for(const config of configs){if(!config.enabled)continue;const node=this.prepareNode(config,context);if(config.type==='cvislicer'||config.type==='differentiator'||config.type==='scanimate')encoder.copyBufferToBuffer(this.pixels,0,this.scratch,0,this.pixels.size);if(config.type==='scanimate'&&node.auxiliary)encoder.clearBuffer(node.auxiliary);const pass=encoder.beginComputePass();pass.setPipeline(node.pipeline);pass.setBindGroup(0,node.group);const density=Math.max(2,Math.min(16,Math.round(config.params.density??4)));const workItems=config.type==='scanimate'?context.width*Math.ceil(context.height/density):context.width*context.height;pass.dispatchWorkgroups(Math.ceil(workItems/256));pass.end();if(node.secondPipeline&&node.secondGroup){const second=encoder.beginComputePass();second.setPipeline(node.secondPipeline);second.setBindGroup(0,node.secondGroup);second.dispatchWorkgroups(Math.ceil(context.width*context.height/256));second.end();}}
    const render=encoder.beginRenderPass({colorAttachments:[{view:this.context.getCurrentTexture().createView(),loadOp:'clear',storeOp:'store',clearValue:{r:0,g:0,b:0,a:1}}]});render.setPipeline(this.displayPipeline);render.setBindGroup(0,this.displayGroup);render.draw(3);render.end();
    if(diagnosticReadback)encoder.copyBufferToBuffer(this.pixels,0,this.readback,0,this.pixels.size);this.device.queue.submit([encoder.finish()]);
    if(!diagnosticReadback)return;
    await this.readback.mapAsync(GPUMapMode.READ);const copy=new Uint8Array(this.readback.getMappedRange().slice(0));this.readback.unmap();return copy;
  }
  dispose():void{if(this.disposed)return;this.disposed=true;this.context.unconfigure();for(const node of this.nodes.values()){node.parameter.destroy();if(node.lut!==node.parameter)node.lut?.destroy();node.edgeLut?.destroy();node.blendLut?.destroy();node.secondParameter?.destroy();node.auxiliary?.destroy();}this.nodes.clear();this.pixels.destroy();this.scratch.destroy();this.readback.destroy();this.size.destroy();this.sourceTexture.destroy();this.sourceSize.destroy();if(this.ownsDevice)this.device.destroy();}
}
