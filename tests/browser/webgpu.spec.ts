import { test, expect, chromium } from '@playwright/test';

// Declared before measurement: f32 scan candidate gates, separate from WASM.
// Software adapter tests establish functionality only.
test('TapeSat GPU scan preserves tile and frame history', async ({}, testInfo) => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader'] });
  try {
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:5175/benchmark.html');
    const available = await page.evaluate(async () => Boolean(await navigator.gpu?.requestAdapter()));
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
        return { max, rms:Math.sqrt(square/count), adapter: { vendor:gpu.adapterInfo.vendor, architecture:gpu.adapterInfo.architecture, device:gpu.adapterInfo.device, description:gpu.adapterInfo.description }, scope:'software GPU functional validation; no device FPS acceptance' };
      } finally { gpu.dispose(); }
    });
    await testInfo.attach('GPU fidelity', { body:JSON.stringify(result,null,2), contentType:'application/json' });
    expect(result.max).toBeLessThanOrEqual(1e-4);
    expect(result.rms).toBeLessThanOrEqual(1e-5);
  } finally { await browser.close(); }
});

test('GPU resident capture, display and compact gathers match reference',async ({page},testInfo)=>{
  await page.goto('/benchmark.html');
  const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  test.skip(!available,'No WebGPU adapter; resident shader and color path remain unverified.');
  const result=await page.evaluate(async()=>{
    const {WebGpuTapeSat}=await import('/src/engine/backends/webgpu-tapesat.ts');
    const {checkResidentFidelity}=await import('/src/benchmark/gpu-fidelity.ts');
    const gpu=await WebGpuTapeSat.create();
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;document.body.append(canvas);
    const source=document.createElement('canvas');source.width=1280;source.height=720;
    const ctx=source.getContext('2d')!;ctx.fillStyle='rgb(17,128,253)';ctx.fillRect(0,0,1280,720);
    const context=gpu.configureCanvas(canvas);
    try{return await checkResidentFidelity(gpu,context,source);}finally{context.unconfigure();gpu.dispose();canvas.remove();}
  });
  await testInfo.attach('Resident fidelity',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result.passed).toBe(true);
});
