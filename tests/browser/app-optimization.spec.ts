import { chromium, expect, test as base } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const test = base.extend({
  context: async ({}, use, testInfo) => {
    // A caller-owned profile avoids Playwright's slow recursive temp-profile cleanup on Windows.
    const userDataDir = path.join(os.tmpdir(), `sonificationv2-app-optimization-${process.pid}-${testInfo.workerIndex}`);
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      ...(process.env.BENCHMARK_GPU_BROWSER === 'chrome'
        ? { channel: 'chrome', args: ['--enable-unsafe-webgpu'] }
        : {}),
    });
    await use(context);
    await context.close();
  },
});

test.beforeEach(async ({ context, page }) => {
  await context.clearCookies();
  await page.addInitScript(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});

test('source cancellation disposes a late GPU-tail device and rejects its stale frame',async ({page})=>{
  await page.goto('/benchmark.html');
  const result=await page.evaluate(async()=>{
    const {AppWebGpuVideoTail}=await import('/src/engine/backends/app-webgpu-video-tail.ts');
    const {WebGpuVideoTail}=await import('/src/engine/backends/webgpu-video-tail.ts');
    const original=WebGpuVideoTail.create;let resolveCreate!:(runtime:any)=>void;let disposed=false;
    (WebGpuVideoTail as any).create=()=>new Promise(resolve=>{resolveCreate=resolve;});
    const reference=document.createElement('canvas');document.body.append(reference);const tail=new AppWebGpuVideoTail(reference);
    const pending=tail.process(new Uint8ClampedArray(4),[{id:'s',type:'solarizer',enabled:true,params:{threshold:128,gamma:1.4,pedestal:0,invert:1}}] as any,{width:1,height:1,timeMs:0,audioPeak:0,audioRms:0});
    tail.dispose();resolveCreate({process:async()=>undefined,dispose:()=>{disposed=true;}});const result=await pending;
    (WebGpuVideoTail as any).create=original;return {result,disposed,cpuVisible:reference.style.display!=='none'};
  });
  expect(result).toEqual({result:false,disposed:true,cpuVisible:true});
});

test('GPU tail parity check compares output with the submitted video frame',async ({page})=>{
  await page.goto('/benchmark.html');
  const result=await page.evaluate(async()=>{
    const {AppWebGpuVideoTail}=await import('/src/engine/backends/app-webgpu-video-tail.ts');
    const {WebGpuVideoTail}=await import('/src/engine/backends/webgpu-video-tail.ts');
    const original=WebGpuVideoTail.create;const source=document.createElement('canvas');
    const reference=document.createElement('canvas');document.body.append(reference);
    let frame=new Uint8ClampedArray([10,20,30,255]);
    (WebGpuVideoTail as any).create=async()=>({
      processSource:async()=>{const submitted=frame.slice();frame=new Uint8ClampedArray([11,21,31,255]);return submitted;},
      dispose:()=>{},
    });
    const tail=new AppWebGpuVideoTail(reference);let processed=false;
    try{processed=await tail.processSource(source,[],{width:1,height:1,timeMs:0,audioPeak:0,audioRms:0},()=>frame);return {processed,validation:tail.validation};}
    finally{tail.dispose();(WebGpuVideoTail as any).create=original;reference.remove();}
  });
  expect(result).toEqual({processed:true,validation:{passed:true,checkedNodes:[],mismatchBytes:0}});
});

test('GPU spatial tail preserves per-filter bytes and composed R2 order', async ({ page }, testInfo) => {
  test.setTimeout(5 * 60 * 1000);
  await page.goto('/benchmark.html');
  const available = await page.evaluate(async () => Boolean(await navigator.gpu?.requestAdapter()));
  test.skip(!available, 'No WebGPU adapter for GPU spatial-tail conformance');
  const result = await page.evaluate(async () => {
    const { WebGpuVideoTail } = await import('/src/engine/backends/webgpu-video-tail.ts');
    const { createVideoFilterInstance } = await import('/src/engine/video-filters/factory.ts');
    const width=65,height=47,canvas=document.createElement('canvas');
    const input=new Uint8ClampedArray(width*height*4);
    for(let i=0;i<input.length;i++)input[i]=i%4===3?((i/4|0)%4)*85:(i*37+19)%256;
    const defaults:any={
      procamp:{pedestal:0,videoGain:1.18,saturation:1.1,chromaPhase:13,whiteClip:240},
      solarizer:{threshold:128,gamma:1.4,pedestal:10,invert:1},
      colorizer:{lowHue:210,midHue:35,highHue:85,bands:4,mix:.85},
      cvislicer:{levels:6,palette:0,edgeThresh:24,contourMix:.6,mix:.9},
      differentiator:{gain:3.5,bias:0,bipolar:1,invert:0},
    };
    const types=['procamp','solarizer','colorizer','cvislicer','differentiator'] as const;
    const context={width,height,timeMs:1,audioPeak:.3,audioRms:.2};
    const results:any[]=[];
    const runtime=await WebGpuVideoTail.create(canvas,width,height);
    try{
      for(const type of types){
        const config:any={id:`first-${type}`,type,enabled:true,params:defaults[type]};
        const changed:any={...config,params:{...defaults[type]}};
        if(type==='solarizer')changed.params={threshold:240,gamma:.4,pedestal:-50,invert:0};
        if(type==='colorizer')changed.params={lowHue:0,midHue:180,highHue:360,bands:8,mix:0};
        if(type==='cvislicer')changed.params={levels:16,palette:4,edgeThresh:80,contourMix:1,mix:0};
        if(type==='differentiator')changed.params={gain:10,bias:-128,bipolar:0,invert:1};
        const sequence=[config,changed];let mismatches=0;const examples:any[]=[];
        for(const item of sequence){const expected=input.slice();const filter=createVideoFilterInstance(item.type);filter.init(width,height);filter.setParams(item.params);filter.processFrame(expected,context);const actual=await runtime.process(input,[item],context,true);for(let i=0;i<expected.length;i++)if(expected[i]!==actual![i]){mismatches++;if(examples.length<8)examples.push({changed:item===changed,offset:i,expected:expected[i],actual:actual![i]});}}
        results.push({type,mismatches,bytes:input.length*sequence.length,examples});
      }
      const rack=[
        {id:'r2-procamp',type:'procamp',enabled:true,params:{pedestal:0,videoGain:1,saturation:1.1,chromaPhase:0,whiteClip:240}},
        {id:'r2-solarizer',type:'solarizer',enabled:true,params:{threshold:128,gamma:1.4,pedestal:10,invert:1}},
        {id:'r2-colorizer',type:'colorizer',enabled:true,params:{lowHue:210,midHue:35,highHue:85,bands:4,mix:.85}},
      ] as any[];
      let expected=input.slice();for(const item of rack){const filter=createVideoFilterInstance(item.type);filter.init(width,height);filter.setParams(item.params);filter.processFrame(expected,context);}
      const actual=await runtime.process(input,rack,context,true);let mismatches=0;for(let i=0;i<expected.length;i++)if(expected[i]!==actual![i])mismatches++;
      results.push({type:'composed-R2',mismatches,bytes:expected.length});
      const cvi={id:'cvi',type:'cvislicer',enabled:true,params:defaults.cvislicer};
      for(const audioRms of [0,.2,.8]){
        const cviContext={...context,audioRms};const expectedCvi=input.slice();const filter=createVideoFilterInstance('cvislicer');filter.init(width,height);filter.setParams(cvi.params);filter.processFrame(expectedCvi,cviContext);
        const actualCvi=await runtime.process(input,[cvi],cviContext,true);let cviMismatches=0;for(let i=0;i<expectedCvi.length;i++)if(expectedCvi[i]!==actualCvi![i])cviMismatches++;
        results.push({type:`cvislicer-audioRms-${audioRms}`,mismatches:cviMismatches,bytes:expectedCvi.length});
      }
    }finally{runtime.dispose();}
    return results;
  });
  await testInfo.attach('GPU spatial-tail byte parity', { body: JSON.stringify(result,null,2), contentType: 'application/json' });
  expect(result).toEqual(result.map(item=>({...item,mismatches:0})));
});

test('resident source import and ordered Procamp rack preserve reference bytes',async ({page},testInfo)=>{
  test.setTimeout(5*60*1000);
  await page.goto('/benchmark.html');
  const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  test.skip(!available,'No WebGPU adapter for resident source-import conformance');
  const result=await page.evaluate(async()=>{
    const {WebGpuVideoTail}=await import('/src/engine/backends/webgpu-video-tail.ts');
    const {createVideoFilterInstance}=await import('/src/engine/video-filters/factory.ts');
    const width=96,height=64,canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d',{colorSpace:'srgb'})!;const image=ctx.createImageData(width,height);
    for(let i=0;i<image.data.length;i++)image.data[i]=i%4===3?255:(i*37+19)%256;ctx.putImageData(image,0,0);
    document.body.appendChild(canvas);const source=ctx.getImageData(0,0,width,height).data;
    const context={width,height,timeMs:1,audioPeak:.3,audioRms:.2};
    const rack:any[]=[
      {id:'p',type:'procamp',enabled:true,params:{pedestal:0,videoGain:1,saturation:1.1,chromaPhase:0,whiteClip:240}},
      {id:'s',type:'solarizer',enabled:true,params:{threshold:128,gamma:1.4,pedestal:10,invert:1}},
      {id:'c',type:'colorizer',enabled:true,params:{lowHue:210,midHue:35,highHue:85,bands:4,mix:.85}},
    ];
    const runtime=await WebGpuVideoTail.create(document.createElement('canvas'),width,height);const stages:any[]=[];(runtime as any).device.pushErrorScope('validation');
    try{
      for(let count=0;count<=rack.length;count++){
        const expected=source.slice();
        for(const config of rack.slice(0,count)){const filter=createVideoFilterInstance(config.type);filter.init(width,height);filter.setParams(config.params);filter.processFrame(expected,context);}
        const actual=await runtime.processSource(canvas,rack.slice(0,count),context,true);let mismatchBytes=0;const examples:any[]=[];
        for(let i=0;i<expected.length;i++)if(expected[i]!==actual![i]){mismatchBytes++;if(examples.length<8)examples.push({offset:i,expected:expected[i],actual:actual![i]});}
        stages.push({through:count?rack[count-1].type:'source-import',mismatchBytes,examples});
      }
    }finally{const error=await (runtime as any).device.popErrorScope();(window as any).__residentError=error?.message;runtime.dispose();canvas.remove();}
    return {stages,error:(window as any).__residentError};
  });
  await testInfo.attach('Resident source-import stage parity',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  expect(result.error).toBeFalsy();expect(result.stages).toEqual(result.stages.map((stage:any)=>({...stage,mismatchBytes:0,examples:[]})));
});

test('application runs the frozen R2 multi-filter GPU tail with audio and HUD',async ({page},testInfo)=>{
  test.setTimeout(5*60*1000);
  const preset=JSON.parse(await fs.readFile('tests/fixtures/app-optimization/R2.json','utf8'));
  const video=await fs.readFile('tests/fixtures/app-optimization/source-720p30.mp4');
  await page.goto('/benchmark.html');
  const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  test.skip(!available,'No WebGPU adapter for application GPU-tail integration');
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?gpu=cpu-gpu-video-tail&gpu-profile=0&gpu-audio=active&gpu-hud=on');
  const hash=await page.evaluate(async value=>{
    const {PresetManager}=await import('/src/presets/preset-manager.ts');
    return new PresetManager().encodePresetToHash(value);
  },preset);
  await page.goto(`/?gpu=cpu-gpu-video-tail&gpu-profile=0&gpu-audio=active&gpu-hud=on${hash}`);
  await page.locator('#card-input .rack-card-header').click();
  await page.locator('#card-sound .rack-card-header').click();
  await page.locator('#slider-resolution-mount').getByRole('button',{name:'720p',exact:true}).click();
  await page.locator('#slider-volume').evaluate((element:HTMLInputElement)=>{element.value='0.01';element.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#btn-toggle-audio').click();
  await page.locator('#input-video-file').setInputFiles({name:'source-720p30.mp4',mimeType:'video/mp4',buffer:video});
  await expect(page.locator('#perf-badge')).toContainText('GPU-TAIL',{timeout:30000});
  await expect(page.locator('#gpu-video-tail-canvas')).toBeVisible();
  await page.waitForTimeout(11500);
  const downloadEvent=page.waitForEvent('download');await page.locator('#perf-badge').click();
  const download=await downloadEvent;const report=JSON.parse(await fs.readFile((await download.path())!,'utf8'));
  await testInfo.attach('R2 GPU video-tail application report',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  expect(report.route.selectedRouteId).toBe('cpu-gpu-video-tail');
  expect(report.route.activeNodeIds).toEqual(preset.videoFilters.map((node:any)=>node.id));
  expect(report.route.cpuPrefixNodeIds).toEqual(['r2-procamp']);expect(report.route.videoSuffixNodeIds).toEqual(['r2-solarizer','r2-colorizer']);
  expect(report.backend).toBe('experimental-app-gpu-video-tail');
  expect(report.gpuVideoTailFrames).toBeGreaterThan(0);expect(report.jsFrames).toBe(0);
  expect(report.gpuVideoTailValidation).toMatchObject({passed:true,mismatchBytes:0});
  expect(report.audioMuted).toBe(false);expect(report.audioContextState).toBe('running');expect(report.hudEnabled).toBe(true);
  expect(report.transferLedger.measuredTotals.gpuVideoTailRgbaUploadBytes).toBeGreaterThan(0);
  expect(report.transferLedger.measuredTotals.cpuImageDataReadbackBytes).toBe(report.gpuVideoTailFrames*1280*720*4);
  await page.locator('#btn-sync-mode').click();await expect(page.locator('#perf-badge')).toHaveAttribute('data-benchmark-route','cpu-reference');
  await expect(page.locator('#gpu-video-tail-canvas')).toBeHidden();await expect(page.locator('#main-canvas')).toBeVisible();
  await page.locator('#btn-sync-mode').click();await expect(page.locator('#gpu-video-tail-canvas')).toBeVisible();
  await page.locator('#select-bitdepth').evaluate((element:HTMLSelectElement)=>{element.value='16';element.dispatchEvent(new Event('change',{bubbles:true}));});
  await expect(page.locator('#perf-badge')).toHaveAttribute('data-benchmark-route','cpu-reference');await expect(page.locator('#gpu-video-tail-canvas')).toBeHidden();
  await page.locator('#select-bitdepth').evaluate((element:HTMLSelectElement)=>{element.value='8';element.dispatchEvent(new Event('change',{bubbles:true}));});
  await expect(page.locator('#gpu-video-tail-canvas')).toBeVisible();
  page.on('download',download=>{void download.cancel();});
  await page.locator('#btn-record-video').click();await expect(page.locator('#perf-badge')).toHaveAttribute('data-benchmark-route','cpu-reference');await expect(page.locator('#rec-btn-text')).toHaveText('STOP');
  await page.waitForTimeout(300);await page.locator('#btn-record-video').click();await expect(page.locator('#rec-btn-text')).toHaveText('REC');
  await expect(page.locator('#gpu-video-tail-canvas')).toBeVisible();
  await page.locator('#input-video-file').setInputFiles({name:'replacement-source-720p30.mp4',mimeType:'video/mp4',buffer:video});
  await expect(page.locator('#gpu-video-tail-canvas')).toBeVisible({timeout:30000});
  await page.locator('#btn-shutter').click();await expect(page.locator('#gpu-video-tail-canvas')).toBeVisible({timeout:30000});
  expect(errors).toEqual([]);
});

test('no backend argument automatically selects an eligible GPU suffix from the rack chain',async ({page})=>{
  test.setTimeout(90_000);
  const preset=JSON.parse(await fs.readFile('tests/fixtures/app-optimization/R2.json','utf8'));
  const video=await fs.readFile('tests/fixtures/app-optimization/source-720p30.mp4');
  await page.goto('/benchmark.html');
  const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  test.skip(!available,'No WebGPU adapter for default automatic route check');
  const hash=await page.evaluate(async value=>{
    const {PresetManager}=await import('/src/presets/preset-manager.ts');
    return new PresetManager().encodePresetToHash(value);
  },preset);
  await page.goto(`/${hash}`);
  await expect(page.locator('#slider-volume')).toHaveValue('0.01');
  await page.locator('#card-input .rack-card-header').click();
  await page.locator('#slider-resolution-mount').getByRole('button',{name:'720p',exact:true}).click();
  await page.locator('#input-video-file').setInputFiles({name:'source-720p30.mp4',mimeType:'video/mp4',buffer:video});
  await expect(page.locator('#perf-badge')).toHaveAttribute('data-benchmark-route','cpu-gpu-video-tail',{timeout:30000});
  await expect(page.locator('#gpu-video-tail-canvas')).toBeVisible();
});

test('R3 keeps Procamp in the CPU prefix and runs its validated Solarizer/Colorizer GPU suffix',async ({page},testInfo)=>{
  test.setTimeout(5*60*1000);
  const preset=JSON.parse(await fs.readFile('tests/fixtures/app-optimization/R3.json','utf8'));
  const video=await fs.readFile('tests/fixtures/app-optimization/source-720p30.mp4');
  await page.goto('/benchmark.html');
  const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  test.skip(!available,'No WebGPU adapter for R3 application GPU-tail integration');
  await page.goto('/?gpu=cpu-gpu-video-tail&gpu-profile=0&gpu-audio=active&gpu-hud=on');
  const hash=await page.evaluate(async value=>{const {PresetManager}=await import('/src/presets/preset-manager.ts');return new PresetManager().encodePresetToHash(value);},preset);
  await page.goto(`/?gpu=cpu-gpu-video-tail&gpu-profile=0&gpu-audio=active&gpu-hud=on${hash}`);
  await page.locator('#card-input .rack-card-header').click();await page.locator('#card-sound .rack-card-header').click();
  await page.locator('#slider-resolution-mount').getByRole('button',{name:'720p',exact:true}).click();
  await page.locator('#slider-volume').evaluate((element:HTMLInputElement)=>{element.value='0.01';element.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#btn-toggle-audio').click();
  await page.locator('#input-video-file').setInputFiles({name:'source-720p30.mp4',mimeType:'video/mp4',buffer:video});
  await expect(page.locator('#perf-badge')).toContainText('GPU-TAIL',{timeout:30000});await expect(page.locator('#gpu-video-tail-canvas')).toBeVisible();
  await page.waitForTimeout(11500);const downloadEvent=page.waitForEvent('download');await page.locator('#perf-badge').click();
  const download=await downloadEvent;const report=JSON.parse(await fs.readFile((await download.path())!,'utf8'));
  await testInfo.attach('R3 GPU video-tail application report',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  expect(report.route.selectedRouteId).toBe('cpu-gpu-video-tail');expect(report.route.activeNodeIds).toEqual(preset.chain.map((node:any)=>node.id));
  expect(report.route.cpuPrefixNodeIds).toEqual(['r3-tapesat','r3-procamp']);expect(report.route.videoSuffixNodeIds).toEqual(['r3-solarizer','r3-colorizer']);
  expect(report.gpuVideoTailValidation).toMatchObject({passed:true,mismatchBytes:0});expect(report.gpuVideoTailFrames).toBeGreaterThan(0);
  expect(report.audioMuted).toBe(false);expect(report.audioContextState).toBe('running');expect(report.hudEnabled).toBe(true);
  expect(report.transferLedger.measuredTotals.cpuImageDataReadbackBytes).toBe(report.gpuVideoTailFrames*1280*720*4);
});

test('R3 resident route passes byte parity and otherwise falls back cleanly',async ({page},testInfo)=>{
  test.setTimeout(5*60*1000);
  const preset=JSON.parse(await fs.readFile('tests/fixtures/app-optimization/R3.json','utf8'));
  const video=await fs.readFile('tests/fixtures/app-optimization/source-720p30.mp4');
  await page.goto('/benchmark.html');
  const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  test.skip(!available,'No WebGPU adapter for resident-rack integration');
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const hash=await page.evaluate(async value=>{const {PresetManager}=await import('/src/presets/preset-manager.ts');return new PresetManager().encodePresetToHash(value);},preset);
  await page.goto(`/?gpu=gpu-resident-rack&gpu-profile=0&gpu-audio=active&gpu-hud=on${hash}`);
  await page.locator('#card-input .rack-card-header').click();await page.locator('#card-sound .rack-card-header').click();
  await page.locator('#slider-resolution-mount').getByRole('button',{name:'720p',exact:true}).click();
  await page.locator('#slider-volume').evaluate((element:HTMLInputElement)=>{element.value='0.01';element.dispatchEvent(new Event('input',{bubbles:true}));});await page.locator('#btn-toggle-audio').click();
  await page.locator('#input-video-file').setInputFiles({name:'source-720p30.mp4',mimeType:'video/mp4',buffer:video});
  await expect.poll(()=>page.locator('#perf-badge').getAttribute('data-benchmark-route'),{timeout:30000}).toMatch(/gpu-resident-rack|cpu-reference/);
  // Route eligibility resets the benchmark window after startup; allow its full 10s warmup after that reset.
  await page.waitForTimeout(16000);const downloadEvent=page.waitForEvent('download');await page.locator('#perf-badge').click();
  const download=await downloadEvent;const report=JSON.parse(await fs.readFile((await download.path())!,'utf8'));
  await fs.writeFile('docs/performance-results/app-optimization/app-resident-r3-fidelity-screen-precheck.json',JSON.stringify(report,null,2));
  await testInfo.attach('R3 resident-rack application report',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  expect(['gpu-resident-rack','cpu-reference']).toContain(report.route.selectedRouteId);
  expect(report.route.activeNodeIds).toEqual(preset.chain.map((node:any)=>node.id));
  expect(report.audioMuted).toBe(false);expect(report.audioContextState).toBe('running');expect(report.hudEnabled).toBe(true);
  if(report.route.selectedRouteId==='gpu-resident-rack'){
    expect(report.backend).toBe('experimental-app-resident-rack');expect(report.gpuResidentFrames).toBeGreaterThan(0);
    expect(report.transferLedger.measuredTotals.cpuImageDataReadbackBytes).toBe(0);
    expect(report.gpuVideoTailValidation).toMatchObject({passed:true,mismatchBytes:0});
  }else{
    expect(report.route.fallbackReason).toMatch(/fidelity|executor/i);expect(report.jsFrames).toBeGreaterThan(0);
    expect(report.route.cpuPrefixNodeIds).toEqual(report.route.activeNodeIds);expect(report.gpuVideoTailValidation).toMatchObject({passed:false});
  }
  expect(errors).toEqual([]);
});
