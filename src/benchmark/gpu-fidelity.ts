import { WebGpuTapeSat } from '../engine/backends/webgpu-tapesat.ts';
import { TapeSaturationFilter } from '../engine/filters/lofi/tapesat.ts';

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
