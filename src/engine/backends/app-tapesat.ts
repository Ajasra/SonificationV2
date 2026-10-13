import {WebGpuTapeSat} from './webgpu-tapesat.ts';
import {checkGpuFidelity,selectResidentCapture} from '../../benchmark/gpu-fidelity.ts';

export {eligibleTapeSat} from './gpu-eligibility.ts';

export class AppTapeSatGpu {
  readonly canvas=document.createElement('canvas');
  private runtime:WebGpuTapeSat | undefined;
  private context:GPUCanvasContext | undefined;
  private initializing:Promise<boolean> | undefined;
  private epoch=0;
  private failed=false;
  validation:unknown;
  constructor(private readonly referenceCanvas:HTMLCanvasElement){
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
  private async initialize(source:HTMLCanvasElement):Promise<boolean>{
    const epoch=this.epoch,runtime=await WebGpuTapeSat.create();
    if(epoch!==this.epoch){runtime.dispose();return false;}
    this.runtime=runtime;this.context=runtime.configureCanvas(this.canvas);
    const sample=await checkGpuFidelity(runtime,()=>epoch!==this.epoch);
    if(epoch!==this.epoch)return false;
    const selection=await selectResidentCapture(runtime,this.context,source,()=>epoch!==this.epoch);
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
        ? await this.runtime!.processImage(source,this.context!,params)
        : await this.runtime!.processRgba(captureInput().data,this.context!,params);
      if(epoch!==this.epoch)return;
      return result;
    }catch(error){
      if(epoch===this.epoch){this.failed=true;this.showCpu();this.context?.unconfigure();this.runtime?.dispose();console.warn('Experimental GPU fallback',error);}
      return;
    }
  }
}
