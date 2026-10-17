import type {VideoFilterNodeConfig,VideoFrameContext} from '../../types/index.ts';
import {createVideoFilterInstance} from '../video-filters/factory.ts';
import {WebGpuVideoTail} from './webgpu-video-tail.ts';

export class AppWebGpuVideoTail {
  readonly canvas=document.createElement('canvas');
  private runtime:WebGpuVideoTail|undefined;
  private loading:Promise<boolean>|undefined;
  private failed=false;
  private epoch=0;
  private checkedKey='';
  validation:{passed:boolean;checkedNodes:string[];mismatchBytes:number}|undefined;
  constructor(private readonly referenceCanvas:HTMLCanvasElement,private readonly sharedDevice?:()=>GPUDevice|undefined){
    this.canvas.id='gpu-video-tail-canvas';this.canvas.style.display='none';this.canvas.width=1280;this.canvas.height=720;
    referenceCanvas.insertAdjacentElement('afterend',this.canvas);
  }
  private async initialize(width:number,height:number,epoch:number,device=this.sharedDevice?.()):Promise<boolean>{
    const runtime=await WebGpuVideoTail.create(this.canvas,width,height,device);
    if(epoch!==this.epoch){runtime.dispose();return false;}
    this.runtime=runtime;return true;
  }
  async process(rgba:Uint8ClampedArray,configs:VideoFilterNodeConfig[],context:VideoFrameContext):Promise<boolean>{
    return this.processFrame(configs,context,needsCheck=>this.runtime!.process(rgba,configs,context,needsCheck),()=>rgba);
  }
  async processSource(source:HTMLCanvasElement,configs:VideoFilterNodeConfig[],context:VideoFrameContext,captureReference:()=>Uint8ClampedArray):Promise<boolean>{
    return this.processFrame(configs,context,needsCheck=>this.runtime!.processSource(source,configs,context,needsCheck),captureReference);
  }
  private async processFrame(configs:VideoFilterNodeConfig[],context:VideoFrameContext,run:(diagnostic:boolean)=>Promise<Uint8Array|undefined>,captureReference:()=>Uint8ClampedArray):Promise<boolean>{
    if(this.failed)return false;
    const epoch=this.epoch;
    const key=JSON.stringify([context.width,context.height,configs.map(node=>[node.id,node.type,node.enabled,node.params])]);
    try{
      this.loading??=this.initialize(context.width,context.height,epoch);
      if(!await this.loading||epoch!==this.epoch)return false;
      const needsCheck=key!==this.checkedKey;
      if(needsCheck)this.canvas.style.display='none';
      // Freeze the CPU reference before submitting GPU work. For a live video
      // source the canvas may advance while the diagnostic readback is pending.
      const referenceInput=needsCheck?captureReference().slice():undefined;
      const gpuOutput=await run(needsCheck);
      if(needsCheck){
        if(!gpuOutput)throw new Error('GPU tail diagnostic readback is missing');
        const expected=referenceInput!;
        for(const config of configs){if(!config.enabled)continue;const filter=createVideoFilterInstance(config.type);filter.init(context.width,context.height);filter.setParams(config.params);filter.processFrame(expected,context);}
        let mismatchBytes=0;const mismatchSamples:{offset:number;expected:number;actual:number}[]=[];for(let i=0;i<expected.length;i++)if(expected[i]!==gpuOutput[i]){mismatchBytes++;if(mismatchSamples.length<8)mismatchSamples.push({offset:i,expected:expected[i],actual:gpuOutput[i]});}
        this.validation={passed:mismatchBytes===0,checkedNodes:configs.filter(node=>node.enabled).map(node=>node.id),mismatchBytes};
        if(mismatchBytes)throw new Error(`GPU tail parity mismatch: ${mismatchBytes} bytes; nodes=${configs.filter(node=>node.enabled).map(node=>node.type).join('->')}; audioPeak=${context.audioPeak??0}; samples=${JSON.stringify(mismatchSamples)}`);
        this.checkedKey=key;
      }
      return epoch===this.epoch;
    }catch(error){if(epoch===this.epoch){this.failed=true;this.showCpu();this.runtime?.dispose();this.runtime=undefined;console.warn('Experimental GPU video-tail fallback',error);}return false;}
  }
  showCpu():void{this.referenceCanvas.style.display='block';this.canvas.style.display='none';}
  showGpu():void{this.referenceCanvas.style.display='none';this.canvas.style.display='block';}
  reset():void{this.epoch++;this.failed=false;this.checkedKey='';this.runtime?.dispose();this.runtime=undefined;this.loading=undefined;this.validation=undefined;this.showCpu();}
  dispose():void{this.epoch++;this.failed=true;this.runtime?.dispose();this.runtime=undefined;this.loading=undefined;this.showCpu();}
}
