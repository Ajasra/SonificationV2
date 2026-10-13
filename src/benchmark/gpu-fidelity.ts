import { WebGpuTapeSat } from '../engine/backends/webgpu-tapesat.ts';
import { TapeSaturationFilter } from '../engine/filters/lofi/tapesat.ts';
import { imageToAudioStream, audioStreamToImage } from '../engine/streams.ts';

export const GPU_FIDELITY_LIMITS = { maxAbsoluteError: 1e-4, rmsError: 1e-5 } as const;

// Each sample passes through both references with the same retained history.
export async function checkGpuFidelity(gpu: WebGpuTapeSat, cancelled: () => boolean = () => false) {
  const cases: { rate:number; frames:number; samples:number; maxAbsoluteError:number; rmsError:number }[] = [];
  try {
    for (const rate of [8000, 44100, 96000]) {
      gpu.reset();
      const cpu = new TapeSaturationFilter(rate);
      let maxAbsoluteError=0, square=0, count=0, frames=0;
      const lengths = rate === 44100 ? [1,255,256,257,8193,65537,1280*720*3,1280*720*3] : [257,8193,65537];
      for (const n of lengths) {
        if (cancelled()) throw new Error('Fidelity check cancelled');
        const params = frames % 2 ? {drive:10,bias:-.5,bump:1,bumpHz:40,tone:1000} : {drive:2.5,bias:.1,bump:.4,bumpHz:80,tone:8000};
        cpu.setParams(params);
        const input = Float32Array.from({length:n},(_,i)=> i%257===255 ? 1 : Math.sin(i*.31)*.9);
        const expected=input.slice(); cpu.processBlock(expected);
        const actual=await gpu.process(input,params,rate);
        if(cancelled()) throw new Error('Fidelity check cancelled');
        for(let i=0;i<n;i++) {
          const difference=Math.abs(expected[i]-actual[i]);
          if(!Number.isFinite(difference)) throw new Error('Non-finite GPU output');
          maxAbsoluteError=Math.max(maxAbsoluteError,difference);square+=difference*difference;
        }
        count+=n;frames++;
      }
      cases.push({rate,frames,samples:count,maxAbsoluteError,rmsError:Math.sqrt(square/count)});
    }
    return { version:1, limits:GPU_FIDELITY_LIMITS, cases, passed:cases.every(value=>value.maxAbsoluteError<=GPU_FIDELITY_LIMITS.maxAbsoluteError && value.rmsError<=GPU_FIDELITY_LIMITS.rmsError), scope:'sample comparison with parameter changes and retained frame/tile history; no full application or pixel acceptance' };
  } finally { if (!cancelled()) gpu.reset(); }
}

// Pixel bound declared before running the new path: at most one byte level.
// Samples continue to use the original f32 bounds.
export async function checkResidentFidelity(gpu:WebGpuTapeSat, context:GPUCanvasContext, source:HTMLVideoElement | HTMLCanvasElement | ImageBitmap, cancelled:()=>boolean=()=>false) {
  const stream={rawType:'INTERLEAVED',law:'NONE',sign:'UNSIGNED',bits:8,endianess:'LITTLE_ENDIAN',colorSpace:'RGB'} as const;
  const capture=document.createElement('canvas');capture.width=1280;capture.height=720;
  const read=capture.getContext('2d',{willReadFrequently:true});
  if(!read) throw new Error('Fidelity canvas unavailable');
  const cases=[];
  try {
    const fixture=document.createElement('canvas');fixture.width=1280;fixture.height=720;
    const fixtureContext=fixture.getContext('2d')!;const fixturePixels=fixtureContext.createImageData(1280,720);
    for(let i=0;i<fixturePixels.data.length;i+=4){fixturePixels.data[i]=(i*37)%256;fixturePixels.data[i+1]=(i*13+1)%256;fixturePixels.data[i+2]=(i*7+127)%256;fixturePixels.data[i+3]=255;}
    fixtureContext.putImageData(fixturePixels,0,0);
    for(const input of [fixture,source]) {
      if(cancelled()) throw new Error('Fidelity check cancelled');
      gpu.reset();const cpu=new TapeSaturationFilter(44100);
      read.drawImage(input,0,0);const rgba=read.getImageData(0,0,1280,720);
      const encoded=imageToAudioStream(rgba.data,stream);
      const expected=encoded.slice();cpu.processBlock(expected);
      const actual=await gpu.processImage(input,context,{},false,true,rgba.data);
      if(cancelled()) throw new Error('Fidelity check cancelled');
      const captured=gpu.lastDiagnosticInput;
      const actualPixels=gpu.lastDiagnosticPixels;
      if(!captured || !actualPixels)throw new Error('Missing GPU capture diagnostics');
      let maxAbsoluteError=0,square=0,maxErrorIndex=0,captureMaxError=0,captureDifferingSamples=0;
      for(let i=0;i<expected.length;i++){
        const d=Math.abs(expected[i]-actual[i]);if(!Number.isFinite(d))throw new Error('Non-finite resident output');
        if(d>maxAbsoluteError){maxAbsoluteError=d;maxErrorIndex=i;}square+=d*d;
        const inputDifference=Math.abs(encoded[i]-captured[i]);if(!Number.isFinite(inputDifference))throw new Error('Non-finite capture output');captureMaxError=Math.max(captureMaxError,inputDifference);if(inputDifference)captureDifferingSamples++;
      }
      const expectedPixels=new Uint8ClampedArray(rgba.data.length);audioStreamToImage(expected,stream,expectedPixels);
      let maxPixelError=0,differingBytes=0;
      for(let i=0;i<actualPixels.length;i++){const d=Math.abs(expectedPixels[i]-actualPixels[i]);maxPixelError=Math.max(maxPixelError,d);if(d)differingBytes++;}
      // Same captured frame again, now retaining the first frame's history.
      // Freeze reference RGBA bytes: rerasterizing a YUV-backed bitmap can dither
      // differently and would test a different input sequence on the second call.
      const repeated=document.createElement('canvas');repeated.width=1280;repeated.height=720;
      const repeatedContext=repeated.getContext('2d',{willReadFrequently:true})!;
      repeatedContext.putImageData(rgba,0,0);
      const second=imageToAudioStream(rgba.data,stream);cpu.processBlock(second);
      const compact=await gpu.processImage(repeated,context,{},false,false,rgba.data);
      if(cancelled())throw new Error('Fidelity check cancelled');
      let compactMaxError=0;
      for(let i=0;i<6144;i++){
        const index=i<4096 ? i*Math.max(1,Math.floor(second.length/4096)) : i-4096;
        const d=Math.abs(compact[i]-(second[index]??0));if(!Number.isFinite(d))throw new Error('Non-finite compact output');compactMaxError=Math.max(compactMaxError,d);
      }
      cases.push({source:input===fixture?'synthetic-rgb-bytes':'provided-source-frame',samples:expected.length,captureMaxError,captureDifferingSamples,maxAbsoluteError,maxErrorIndex,rmsError:Math.sqrt(square/expected.length),maxPixelError,differingBytes,compactMaxError,firstSamples:{input:Array.from(encoded.subarray(0,12)),captured:Array.from(captured.subarray(0,12)),expected:Array.from(expected.subarray(0,12)),actual:Array.from(actual.subarray(0,12))}});
    }
    return {version:2,limits:{...GPU_FIDELITY_LIMITS,maxPixelByteError:1,captureMaxError:0},cases,passed:cases.every(value=>value.captureMaxError===0 && value.maxAbsoluteError<=GPU_FIDELITY_LIMITS.maxAbsoluteError && value.rmsError<=GPU_FIDELITY_LIMITS.rmsError && value.maxPixelError<=1 && value.compactMaxError<=GPU_FIDELITY_LIMITS.maxAbsoluteError),scope:'exact RGB capture samples, filtered samples, owned render texture bytes and compact gather comparison'};
  } finally {if(!cancelled())gpu.reset();}
}

export async function selectResidentCapture(gpu:WebGpuTapeSat,context:GPUCanvasContext,source:HTMLVideoElement | HTMLCanvasElement | ImageBitmap,cancelled:()=>boolean=()=>false,requested:'auto'|'reference-bytes'='auto'){
  const probe=await checkResidentFidelity(gpu,context,source,cancelled);
  if(cancelled())throw new Error('Fidelity check cancelled');
  if(requested==='reference-bytes'){
    gpu.useReferenceBytes();
    const fidelity=await checkResidentFidelity(gpu,context,source,cancelled);
    if(cancelled())throw new Error('Fidelity check cancelled');
    return {textureProbe:probe,fidelity,captureMode:gpu.captureMode};
  }
  if(probe.cases.some(value=>value.captureMaxError>0)){
    gpu.useReferenceBytes();
    return {textureProbe:probe,fidelity:await checkResidentFidelity(gpu,context,source,cancelled),captureMode:gpu.captureMode};
  }
  return {textureProbe:null,fidelity:probe,captureMode:gpu.captureMode};
}
