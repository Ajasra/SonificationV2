import { test, expect } from '@playwright/test';

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
test(`resident video benchmark completes (${altered?'altered readback':'texture capture'})`,async ({page},testInfo)=>{
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
  expect(report.captureSelection.captureMode).toBe(altered?'reference-bytes':'texture');
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
