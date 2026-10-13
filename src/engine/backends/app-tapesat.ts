import {WebGpuTapeSat} from './webgpu-tapesat.ts';
import {checkGpuFidelity,selectResidentCapture} from '../../benchmark/gpu-fidelity.ts';
import {summarize} from '../../benchmark/report.ts';

export {eligibleTapeSat} from './gpu-eligibility.ts';

export class AppTapeSatGpu {
  readonly canvas=document.createElement('canvas');
  private runtime:WebGpuTapeSat | undefined;
  private context:GPUCanvasContext | undefined;
  private initializing:Promise<boolean> | undefined;
  private epoch=0;
  private failed=false;
  private readonly internalTimings:{gpuPrepareSubmitMs:number[];gpuValidationCompletionMapMs:number[];gpuMappedCopyMs:number[]}={gpuPrepareSubmitMs:[],gpuValidationCompletionMapMs:[],gpuMappedCopyMs:[]};
  validation:unknown;
  constructor(private readonly referenceCanvas:HTMLCanvasElement,private readonly profileInternalTimings=false){
    this.canvas.id='gpu-main-canvas';this.canvas.width=1280;this.canvas.height=720;this.canvas.style.display='none';
    referenceCanvas.insertAdjacentElement('afterend',this.canvas);
  }
  showCpu():void {this.referenceCanvas.style.display='block';this.canvas.style.display='none';}
  showGpu():void {this.referenceCanvas.style.display='none';this.canvas.style.display='block';}
  reset():void {
    this.epoch++;this.context?.unconfigure();this.runtime?.dispose();this.context=undefined;this.runtime=undefined;
    this.initializing=undefined;this.failed=false;this.showCpu();
    this.validation=undefined;
  }
  getInternalTimingSummary():Record<string,ReturnType<typeof summarize>> | undefined {
    if(!this.profileInternalTimings)return;
    return {gpuPrepareSubmitMs:summarize(this.internalTimings.gpuPrepareSubmitMs),gpuValidationCompletionMapMs:summarize(this.internalTimings.gpuValidationCompletionMapMs),gpuMappedCopyMs:summarize(this.internalTimings.gpuMappedCopyMs)};
  }
  private collectInternalTimings():void {
    const timings=this.runtime?.lastTimings;
    if(!this.profileInternalTimings || !timings)return;
    for(const key of Object.keys(this.internalTimings) as (keyof typeof this.internalTimings)[]){
      const value=timings[key];if(typeof value!=='number' || !Number.isFinite(value) || value<0)continue;
      const samples=this.internalTimings[key];samples.push(value);if(samples.length>10000)samples.shift();
    }
  }
  private async initialize(source:HTMLCanvasElement):Promise<boolean>{
    const epoch=this.epoch,runtime=await WebGpuTapeSat.create();
    if(epoch!==this.epoch){runtime.dispose();return false;}
    this.runtime=runtime;this.context=runtime.configureCanvas(this.canvas);
    const sample=await checkGpuFidelity(runtime,()=>epoch!==this.epoch);
    if(epoch!==this.epoch)return false;
    // Keep fidelity probing off the live readback canvas. Importing that
    // willReadFrequently surface into WebGPU can change its backing and make
    // subsequent CPU readbacks much slower, even when texture mode is rejected.
    const probeCanvas=document.createElement('canvas');
    probeCanvas.width=source.width;probeCanvas.height=source.height;
    const probeContext=probeCanvas.getContext('2d',{willReadFrequently:true,colorSpace:'srgb'});
    if(!probeContext)throw new Error('GPU fidelity probe canvas unavailable');
    probeContext.drawImage(source,0,0);
    const selection=await selectResidentCapture(runtime,this.context,probeCanvas,()=>epoch!==this.epoch);
    if(epoch!==this.epoch)return false;
    this.validation={sample,resident:selection.fidelity,textureProbe:selection.textureProbe,captureMode:selection.captureMode,adapter:{vendor:runtime.adapterInfo.vendor,architecture:runtime.adapterInfo.architecture,device:runtime.adapterInfo.device,description:runtime.adapterInfo.description}};
    if(!sample.passed || !selection.fidelity.passed)throw new Error('Application GPU fidelity gate failed');
    return true;
  }
  async process(source:HTMLCanvasElement,captureInput:()=>ImageData,params:Record<string,number>,state:{bumpLp:number;toneLp:number}):Promise<Float32Array | undefined>{
    if(this.failed)return;
    const epoch=this.epoch;
    try{
      this.initializing??=this.initialize(source);
      if(!await this.initializing || epoch!==this.epoch)return;
      this.runtime!.seedState(state.bumpLp,state.toneLp);
      const result=this.runtime!.captureMode==='texture'
        ? await this.runtime!.processImage(source,this.context!,params,this.profileInternalTimings)
        : await this.runtime!.processRgba(captureInput().data,this.context!,params,this.profileInternalTimings);
      this.collectInternalTimings();
      if(epoch!==this.epoch)return;
      return result;
    }catch(error){
      if(epoch===this.epoch){this.failed=true;this.showCpu();this.context?.unconfigure();this.runtime?.dispose();console.warn('Experimental GPU fallback',error);}
      return;
    }
  }
}
