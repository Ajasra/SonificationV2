import { test as base, expect, chromium } from '@playwright/test';
// Isolate native GPU resources between tests, including codec-backed textures.
const test=base.extend({context:async ({},use)=>{
  const browser=await chromium.launch({headless:true,...(process.env.BENCHMARK_GPU_BROWSER==='chrome'?{channel:'chrome',args:['--enable-unsafe-webgpu']}: {})});
  const context=await browser.newContext({baseURL:'http://127.0.0.1:5175'});
  try{await use(context);}finally{await browser.close();}
}});

// Declared before measurement: f32 scan candidate gates, separate from WASM.
// Adapter tests establish functionality; named-device FPS gates are separate.
test('TapeSat GPU scan preserves tile and frame history', async ({page}, testInfo) => {
    await page.goto('http://127.0.0.1:5175/benchmark.html');
    const available = await page.evaluate(async () => Boolean(await navigator.gpu?.requestAdapter()));
    if(process.env.BENCHMARK_GPU_BROWSER==='chrome')expect(available).toBe(true);
    test.skip(!available, 'No WebGPU adapter in this environment; GPU fidelity remains unverified.');
    const result = await page.evaluate(async () => {
      const { WebGpuTapeSat } = await import('/src/engine/backends/webgpu-tapesat.ts');
      const { TapeSaturationFilter } = await import('/src/engine/filters/lofi/tapesat.ts');
      const gpu = await WebGpuTapeSat.create();
      const cpu = new TapeSaturationFilter(44100);
      let max = 0, square = 0, count = 0;
      try {
        for (const n of [1, 255, 256, 257, 8193, 65537]) {
          const input = Float32Array.from({ length: n }, (_, i) => Math.sin(i * .31));
          const expected = input.slice(); cpu.processBlock(expected);
          const actual = await gpu.process(input);
          for (let i = 0; i < n; i++) { const d = Math.abs(expected[i]-actual[i]); max=Math.max(max,d); square+=d*d; count++; }
        }
        gpu.reset(); cpu.init();
        const input = new Float32Array(257); input[255]=1;
        const expected=input.slice(); cpu.processBlock(expected);
        const actual=await gpu.process(input);
        for(let i=0;i<input.length;i++) max=Math.max(max,Math.abs(expected[i]-actual[i]));
        return { max, rms:Math.sqrt(square/count), adapter: { vendor:gpu.adapterInfo.vendor, architecture:gpu.adapterInfo.architecture, device:gpu.adapterInfo.device, description:gpu.adapterInfo.description }, scope:'adapter-specific functional validation; no device FPS acceptance' };
      } finally { gpu.dispose(); }
    });
    await testInfo.attach('GPU fidelity', { body:JSON.stringify(result,null,2), contentType:'application/json' });
    expect(result.max).toBeLessThanOrEqual(1e-4);
    expect(result.rms).toBeLessThanOrEqual(1e-5);
});

test('GPU resident capture, display and compact gathers match reference',async ({page},testInfo)=>{
  await page.goto('/benchmark.html');
  const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  if(process.env.BENCHMARK_GPU_BROWSER==='chrome')expect(available).toBe(true);
  test.skip(!available,'No WebGPU adapter; resident shader and color path remain unverified.');
  const result=await page.evaluate(async()=>{
    const {WebGpuTapeSat}=await import('/src/engine/backends/webgpu-tapesat.ts');
    const {checkGpuFidelity,checkResidentFidelity}=await import('/src/benchmark/gpu-fidelity.ts');
    const gpu=await WebGpuTapeSat.create();
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;document.body.append(canvas);
    const source=document.createElement('canvas');source.width=1280;source.height=720;
    const ctx=source.getContext('2d')!;ctx.fillStyle='rgb(17,128,253)';ctx.fillRect(0,0,1280,720);
    const context=gpu.configureCanvas(canvas);
    try{const base=await checkGpuFidelity(gpu);return {base,resident:await checkResidentFidelity(gpu,context,source)};}finally{context.unconfigure();gpu.dispose();canvas.remove();}
  });
  await testInfo.attach('Resident fidelity',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result.base.passed).toBe(true);expect(result.resident.passed).toBe(true);
});

for(const altered of [false,true]) {
test(`resident video benchmark completes with adaptive capture (${altered?'altered readback':'video frame'})`,async ({page},testInfo)=>{
  await page.goto('/benchmark.html');
  const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  if(process.env.BENCHMARK_GPU_BROWSER==='chrome')expect(available).toBe(true);
  test.skip(!available,'No WebGPU adapter for decoded video test');
  if(altered)await page.evaluate(()=>{
    const original=CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData=function(...args){const value=original.apply(this,args);value.data[0]^=1;return value;};
  });
  const bytes=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;
    const ctx=canvas.getContext('2d')!;ctx.fillStyle='rgb(17,128,253)';ctx.fillRect(0,0,1280,720);
    const stream=canvas.captureStream(30),chunks:BlobPart[]=[];
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp8'});
    let frame=0;const timer=setInterval(()=>{ctx.fillStyle=`rgb(${17+frame++%32},128,253)`;ctx.fillRect(0,0,1280,720);},33);
    recorder.ondataavailable=event=>chunks.push(event.data);
    const stopped=new Promise<void>(resolve=>recorder.onstop=()=>resolve());
    recorder.start();await new Promise(resolve=>setTimeout(resolve,1000));recorder.stop();await stopped;clearInterval(timer);stream.getTracks().forEach(track=>track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  });
  await page.locator('#source').setInputFiles({name:'resident-video.webm',mimeType:'video/webm',buffer:Buffer.from(bytes)});
  await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#preset').selectOption('tapesat');await page.locator('#backend').selectOption('webgpu-resident');await page.locator('#duration').fill('1');
  await page.locator('#run').click();
  await expect(page.locator('#report')).toContainText('"processedFps"',{timeout:30000});
  const report=JSON.parse(await page.locator('#report').textContent()||'{}');
  await testInfo.attach('Resident video report',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  expect(report.gpuFidelity.passed).toBe(true);expect(report.residentFidelity.passed).toBe(true);expect(report.measuredFrames).toBeGreaterThan(0);
  expect(['texture','reference-bytes']).toContain(report.captureSelection.captureMode);
  if(report.captureSelection.captureMode==='texture')expect(report.captureSelection.textureProbe).toBeNull();
  else expect(report.captureSelection.textureProbe).not.toBeNull();
});
}

test('capture fallback preserves altered reference canvas bytes',async ({page},testInfo)=>{
  await page.goto('/benchmark.html');
  const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  if(process.env.BENCHMARK_GPU_BROWSER==='chrome')expect(available).toBe(true);
  test.skip(!available,'No WebGPU adapter for byte-preserving fallback');
  const result=await page.evaluate(async()=>{
    const {WebGpuTapeSat}=await import('/src/engine/backends/webgpu-tapesat.ts');
    const {selectResidentCapture}=await import('/src/benchmark/gpu-fidelity.ts');
    const original=CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData=function(...args){
      const value=original.apply(this,args);value.data[0]^=1;return value;
    };
    const gpu=await WebGpuTapeSat.create();
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;document.body.append(canvas);
    const source=document.createElement('canvas');source.width=1280;source.height=720;const ctx=source.getContext('2d')!;ctx.fillStyle='rgb(17,128,253)';ctx.fillRect(0,0,1280,720);
    const context=gpu.configureCanvas(canvas);
    try{return await selectResidentCapture(gpu,context,source);}finally{CanvasRenderingContext2D.prototype.getImageData=original;context.unconfigure();gpu.dispose();canvas.remove();}
  });
  await testInfo.attach('Byte fallback fidelity',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result.captureMode).toBe('reference-bytes');expect(result.textureProbe?.passed).toBe(false);expect(result.fidelity.passed).toBe(true);
  expect(result.fidelity.cases.every(value=>value.captureMaxError===0)).toBe(true);
});

test('GPU compact audio, raw HUD preview and JS state handoff preserve mapping',async ({page})=>{
  await page.goto('/benchmark.html');const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  if(process.env.BENCHMARK_GPU_BROWSER==='chrome')expect(available).toBe(true);test.skip(!available,'No GPU adapter for handoff');
  const result=await page.evaluate(async()=>{
    const {WebGpuTapeSat}=await import('/src/engine/backends/webgpu-tapesat.ts');
    const {SonificationPipeline}=await import('/src/engine/pipeline.ts');
    const {imageToAudioStream}=await import('/src/engine/streams.ts');
    const stream={rawType:'INTERLEAVED',law:'NONE',sign:'UNSIGNED',bits:8,endianess:'LITTLE_ENDIAN',colorSpace:'RGB'} as const;
    const preset={id:'handoff',name:'handoff',reader:{...stream},writer:{...stream},filters:[{id:'sat',type:'tapesat' as const,enabled:true,sampleRate:44100,params:{drive:2.5,bias:.1,bump:.4,bumpHz:80,tone:8000}}],videoFilters:[],equalize:false,blendMode:'NONE' as const,blendAmount:0};
    const input=Uint8ClampedArray.from({length:65*47*4},(_,i)=>i%4===3?255:(i*37)%256);
    const gold=new SonificationPipeline(),hybrid=new SonificationPipeline();gold.processFrame(input,65,47,preset);hybrid.processFrame(input,65,47,preset);
    const expected=gold.processFrame(input,65,47,preset).audioSamples.slice();const raw=imageToAudioStream(input,stream);
    const gpu=await WebGpuTapeSat.create(true),canvas=document.createElement('canvas');canvas.width=65;canvas.height=47;document.body.append(canvas);const context=gpu.configureCanvas(canvas);
    try{
      const state=hybrid.tapeSatState(preset,65,47,'sat');gpu.seedState(state.bumpLp,state.toneLp);
      const compact=await gpu.processRgba(input,context,preset.filters[0].params);let mappedMax=0,rawMax=0;
      for(let i=0;i<4096;i++)mappedMax=Math.max(mappedMax,Math.abs(compact[i]-expected[i*Math.max(1,Math.floor(expected.length/4096))]));
      for(let i=0;i<2048;i++){mappedMax=Math.max(mappedMax,Math.abs(compact[4096+i]-expected[i]));rawMax=Math.max(rawMax,Math.abs(compact[6144+i]-raw[i]));}
      hybrid.tapeSatState(preset,65,47,'sat',{version:1,sampleRate:44100,bumpLp:compact[8192],toneLp:compact[8193]});
      const continued=hybrid.processFrame(input,65,47,preset).audioSamples,expectedContinuation=gold.processFrame(input,65,47,preset).audioSamples;let continuationMax=0;
      for(let i=0;i<continued.length;i++)continuationMax=Math.max(continuationMax,Math.abs(continued[i]-expectedContinuation[i]));
      return {length:compact.length,mappedMax,rawMax,continuationMax};
    }finally{context.unconfigure();gpu.dispose();}
  });
  expect(result.length).toBe(8194);expect(result.rawMax).toBe(0);expect(result.mappedMax).toBeLessThanOrEqual(1e-4);expect(result.continuationMax).toBeLessThanOrEqual(1e-4);
});

test('Procamp GPU prototype preserves pixels and benchmarks transfers against CPU',async ({page},testInfo)=>{
  await page.goto('/benchmark.html');
  const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  if(process.env.BENCHMARK_GPU_BROWSER==='chrome')expect(available).toBe(true);
  test.skip(!available,'No WebGPU adapter for Procamp prototype');
  const result=await page.evaluate(async()=>{
    const {ProcAmpFilter}=await import('/src/engine/video-filters/color/procamp.ts');
    const {WebGpuProcAmp}=await import('/src/engine/backends/webgpu-procamp.ts');
    const width=1280,height=720,source=new Uint8ClampedArray(width*height*4);
    for(let i=0;i<source.length;i++)source[i]=i%4===3?255:(i*37)%256;
    const params={pedestal:0,videoGain:1,saturation:1.1,chromaPhase:0,whiteClip:240};
    const cpuFilter=new ProcAmpFilter();cpuFilter.setParams(params);const gold=source.slice();cpuFilter.processFrame(gold,{width,height,timeMs:0,audioRms:.2,audioPeak:.25});
    const gpu=await WebGpuProcAmp.create(),cpuMs:number[]=[],gpuMs:number[]=[];let maxByteError=0,differentBytes=0,comparedBytes=0,cpuChecked=false,gpuChecked=false;
    const order=['cpu','gpu','gpu','cpu','cpu','gpu'] as const;
    try{
      const scenarios=[params,{pedestal:-12,videoGain:2.1,saturation:2,chromaPhase:37,whiteClip:200},{pedestal:24,videoGain:.55,saturation:.3,chromaPhase:-87,whiteClip:255}];
      for(const scenario of scenarios){
        const filter=new ProcAmpFilter();filter.setParams(scenario);const expected=source.slice();filter.processFrame(expected,{width,height,timeMs:0,audioRms:.2,audioPeak:.4});
        const actual=await gpu.processFrame(source,width,height,scenario,.4);
        for(let i=0;i<actual.length;i++){const error=Math.abs(actual[i]-expected[i]);maxByteError=Math.max(maxByteError,error);if(error!==0)differentBytes++;comparedBytes++;}
      }
      for(const mode of order)for(let frame=0;frame<5;frame++){
        if(mode==='cpu'){
          const input=source.slice(),filter=new ProcAmpFilter();filter.setParams(params);const start=performance.now();filter.processFrame(input,{width,height,timeMs:0,audioRms:.2,audioPeak:.25});cpuMs.push(performance.now()-start);
          if(!cpuChecked){for(let i=0;i<input.length;i++){const error=Math.abs(input[i]-gold[i]);maxByteError=Math.max(maxByteError,error);if(error!==0)differentBytes++;comparedBytes++;}cpuChecked=true;}
        }else{
          const start=performance.now(),output=await gpu.processFrame(source,width,height,params,.25);gpuMs.push(performance.now()-start);
          if(!gpuChecked){for(let i=0;i<output.length;i++){const error=Math.abs(output[i]-gold[i]);maxByteError=Math.max(maxByteError,error);if(error!==0)differentBytes++;comparedBytes++;}gpuChecked=true;}
        }
      }
      const p95=(values:number[])=>values.slice().sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
      return {width,height,comparedBytes,maxByteError,differentBytes,
        cpu:{count:cpuMs.length,p95:p95(cpuMs),mean:cpuMs.reduce((a,b)=>a+b,0)/cpuMs.length},
        gpu:{count:gpuMs.length,p95:p95(gpuMs),mean:gpuMs.reduce((a,b)=>a+b,0)/gpuMs.length}};
    }finally{gpu.dispose();}
  });
  await testInfo.attach('Procamp GPU prototype comparison',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  console.log('Procamp CPU/GPU comparison:',JSON.stringify(result));
  expect(result.maxByteError).toBeLessThanOrEqual(1);
  expect(result.gpu.count).toBe(15);expect(result.cpu.count).toBe(15);
});

test('Vidicon GPU history preserves a 20-frame sequence and bounded state reset',async ({page},testInfo)=>{
  await page.goto('/benchmark.html');const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  if(process.env.BENCHMARK_GPU_BROWSER==='chrome')expect(available).toBe(true);test.skip(!available,'No WebGPU adapter for temporal Vidicon prototype');
  const result=await page.evaluate(async()=>{
    const {VidiconFilter}=await import('/src/engine/video-filters/optic/vidicon.ts');
    const {WebGpuVidicon}=await import('/src/engine/backends/webgpu-vidicon.ts');
    const width=1280,height=720,params={decay:.88,threshold:110,glowGain:1.3,tint:1},cpu=new VidiconFilter(),gpu=await WebGpuVidicon.create();
    cpu.init(width,height);cpu.setParams(params);gpu.reset(width,height);
    const base=new Uint8ClampedArray(width*height*4);for(let i=0;i<base.length;i++)base[i]=i%4===3?255:(i*37)%256;
    const cpuMs:number[]=[],gpuMs:number[]=[];let maxByteError=0,differentBytes=0,comparedBytes=0;
    const percentile=(a:number[])=>a.slice().sort((x,y)=>x-y)[Math.ceil(a.length*.95)-1];
    try{
      for(let frame=0;frame<20;frame++){
        const frameParams=frame<10?params:{...params,decay:.96,tint:2};cpu.setParams(frameParams);
        const input=base.slice(),x=(frame*47)% (width-80),y=(frame*23)%(height-60);
        for(let py=y;py<y+60;py++)for(let px=x;px<x+80;px++){const i=(py*width+px)*4;input[i]=255;input[i+1]=230;input[i+2]=80;}
        const cpuInput=input.slice(),cpuStart=performance.now();cpu.processFrame(cpuInput,{width,height,timeMs:frame*33,audioRms:0,audioPeak:0});cpuMs.push(performance.now()-cpuStart);
        const gpuStart=performance.now(),gpuOutput=await gpu.processFrame(input,width,height,frameParams);gpuMs.push(performance.now()-gpuStart);
        for(let i=0;i<cpuInput.length;i++){const error=Math.abs(cpuInput[i]-gpuOutput[i]);maxByteError=Math.max(maxByteError,error);if(error!==0)differentBytes++;comparedBytes++;}
      }
      const smallW=65,smallH=47,smallInput=Uint8ClampedArray.from({length:smallW*smallH*4},(_,i)=>i%4===3?255:(i*29)%256),cpuSmall=new VidiconFilter();
      cpuSmall.init(smallW,smallH);cpuSmall.setParams(params);gpu.reset(smallW,smallH);const expected=smallInput.slice();cpuSmall.processFrame(expected,{width:smallW,height:smallH,timeMs:0,audioRms:0,audioPeak:0});const actual=await gpu.processFrame(smallInput,smallW,smallH,params);let resizeError=0;for(let i=0;i<expected.length;i++)resizeError=Math.max(resizeError,Math.abs(expected[i]-actual[i]));
      return {width,height,frames:20,comparedBytes,maxByteError,differentBytes,resizeError,cpu:{count:cpuMs.length,p95Ms:percentile(cpuMs),meanMs:cpuMs.reduce((a,b)=>a+b,0)/cpuMs.length},gpu:{count:gpuMs.length,p95Ms:percentile(gpuMs),meanMs:gpuMs.reduce((a,b)=>a+b,0)/gpuMs.length}};
    }finally{gpu.dispose();}
  });
  await testInfo.attach('Vidicon GPU temporal prototype',{body:JSON.stringify(result,null,2),contentType:'application/json'});console.log('Vidicon CPU/GPU sequence:',JSON.stringify(result));
  expect(result.maxByteError).toBeLessThanOrEqual(1);expect(result.resizeError).toBeLessThanOrEqual(1);expect(result.frames).toBe(20);
});
