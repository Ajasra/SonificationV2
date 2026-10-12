import {test,expect,chromium} from '@playwright/test';
import fs from 'node:fs/promises';

test('normal application startup stays on JS without loading the GPU backend',async ({page})=>{
  const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
  await page.goto('/');
  await expect(page.locator('#slider-resolution-mount .step-slider-readout')).toHaveText('480p');
  expect(await page.locator('#gpu-main-canvas').count()).toBe(0);
  expect(await page.locator('#perf-badge').getAttribute('role')).toBeNull();
  expect(requests.some(url=>url.includes('/backends/app-tapesat'))).toBe(false);
});

test('application GPU path feeds audio/HUD and falls back across resolution and formats',async ({},testInfo)=>{
  const browser=await chromium.launch({headless:true,...(process.env.BENCHMARK_GPU_BROWSER==='chrome'?{channel:'chrome',args:['--enable-unsafe-webgpu']}: {})});
  const context=await browser.newContext({baseURL:'http://127.0.0.1:5175'});const page=await context.newPage();
  try{
  await page.goto('/benchmark.html');
  const available=await page.evaluate(async()=>Boolean(await navigator.gpu?.requestAdapter()));
  if(process.env.BENCHMARK_GPU_BROWSER==='chrome')expect(available).toBe(true);
  test.skip(!available,'No GPU adapter for application integration');
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.text().includes('Experimental GPU fallback'))console.log(message.text());});
  const setup=await page.evaluate(async()=>{
    const {PresetManager}=await import('/src/presets/preset-manager.ts');
    const stream={rawType:'INTERLEAVED',law:'NONE',sign:'UNSIGNED',bits:8,endianess:'LITTLE_ENDIAN',colorSpace:'RGB'} as const;
    const preset={id:'app-gpu-test',name:'GPU TapeSat test',reader:{...stream},writer:{...stream},filters:[{id:'sat',type:'tapesat' as const,enabled:true,sampleRate:44100,params:{drive:2.5,bias:.1,bump:.4,bumpHz:80,tone:8000}}],videoFilters:[],equalize:false,blendMode:'NONE' as const,blendAmount:0};
    const hash=new PresetManager().encodePresetToHash(preset);
    const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d')!;
    const streamVideo=canvas.captureStream(30),chunks:BlobPart[]=[];const recorder=new MediaRecorder(streamVideo,{mimeType:'video/webm;codecs=vp8'});
    recorder.ondataavailable=event=>chunks.push(event.data);const stopped=new Promise<void>(resolve=>recorder.onstop=()=>resolve());
    let frame=0;const timer=setInterval(()=>{ctx.fillStyle=`rgb(${frame++%255},128,240)`;ctx.fillRect(0,0,1280,720);},33);
    recorder.start();await new Promise(resolve=>setTimeout(resolve,1000));recorder.stop();await stopped;clearInterval(timer);streamVideo.getTracks().forEach(track=>track.stop());
    return {hash,bytes:Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()))};
  });
  await page.goto(`/?gpu=tapesat${setup.hash}`);
  await page.locator('#card-input .rack-card-header').click();
  await page.locator('#card-sound .rack-card-header').click();
  await page.locator('#slider-resolution-mount').getByRole('button',{name:'720p',exact:true}).click();
  await page.locator('#slider-volume').evaluate((element:HTMLInputElement)=>{element.value='0';element.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#btn-toggle-audio').click();
  await page.locator('#input-video-file').setInputFiles({name:'app-gpu-video.webm',mimeType:'video/webm',buffer:Buffer.from(setup.bytes)});
  await expect(page.locator('#perf-badge')).toContainText('GPU',{timeout:20000}).catch(async error=>{
    console.log(await page.evaluate(()=>({videos:Array.from(document.querySelectorAll('video')).map(video=>({ready:video.readyState,error:video.error?.message,paused:video.paused,dimensions:[video.videoWidth,video.videoHeight]})),resolution:document.querySelector('#status-resolution')?.textContent})));throw error;
  });
  await expect(page.locator('#gpu-main-canvas')).toBeVisible();
  await page.waitForTimeout(11500);
  const downloading=page.waitForEvent('download');await page.locator('#perf-badge').click();const downloaded=await downloading;
  const report=JSON.parse(await fs.readFile((await downloaded.path())!,'utf8'));
  await testInfo.attach('Application GPU smoke report',{body:JSON.stringify(report,null,2),contentType:'application/json'});
  expect(report.gpuFrames).toBeGreaterThan(0);expect(report.jsFrames).toBe(0);expect(report.audioMuted).toBe(false);expect(report.hudEnabled).toBe(true);expect(report.audioContextState).toBe('running');
  expect(report.gpuValidation.sample.passed).toBe(true);expect(report.gpuValidation.resident.passed).toBe(true);
  await page.locator('#slider-resolution-mount').getByRole('button',{name:'480p',exact:true}).click();await expect(page.locator('#gpu-main-canvas')).toBeHidden();await expect(page.locator('#main-canvas')).toBeVisible();
  await page.locator('#slider-resolution-mount').getByRole('button',{name:'720p',exact:true}).click();await expect(page.locator('#gpu-main-canvas')).toBeVisible();
  await page.locator('#select-bitdepth').evaluate((element:HTMLSelectElement)=>{element.value='16';element.dispatchEvent(new Event('change',{bubbles:true}));});await expect(page.locator('#perf-badge')).toContainText('JS');await expect(page.locator('#gpu-main-canvas')).toBeHidden();
  await page.locator('#select-bitdepth').evaluate((element:HTMLSelectElement)=>{element.value='8';element.dispatchEvent(new Event('change',{bubbles:true}));});await expect(page.locator('#perf-badge')).toContainText('GPU');
  await page.locator('#input-video-file').setInputFiles({name:'replacement.webm',mimeType:'video/webm',buffer:Buffer.from(setup.bytes)});
  await expect(page.locator('#gpu-main-canvas')).toBeVisible({timeout:20000});
  expect(errors).toEqual([]);
  await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
  }finally{await browser.close();}
});
