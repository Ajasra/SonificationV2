import {createHash} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {createReadStream} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from '@playwright/test';

const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const defaultVideo=path.join(repoRoot,'test_60fps.mov');
const argv=process.argv.slice(2);
const usage=`Usage: npm run benchmark:app-gpu -- [options]

Runs the real 720p WebGPU application benchmark in Chrome and saves its JSON report.

Options:
  --video <path>       Video file (default: test_60fps.mov in the repository root)
  --duration <seconds> Measured duration, excluding the app's warmup (default: 60)
  --gpu-validation <on|off> Per-frame WebGPU validation scope (default: on)
  --gpu-fused-apply <on|off> Fuse hierarchical prefix carry, filter, and state save (default: on)
  --hud <on|off>        HUD rendering state (default: on)
  --output-dir <path>  Report directory (default: ~/Downloads)
  --headed             Show the Chrome window
  --help               Show this help
`;
function option(name,fallback){
  const inline=argv.find(value=>value.startsWith(`${name}=`));
  if(inline)return inline.slice(name.length+1);
  const index=argv.indexOf(name);
  return index<0?fallback:argv[index+1];
}
function waitForExit(child,timeoutMs){
  if(child.exitCode!==null)return Promise.resolve(true);
  return new Promise(resolve=>{
    const onExit=()=>{clearTimeout(timer);resolve(true);};
    const timer=setTimeout(()=>{child.off('exit',onExit);resolve(child.exitCode!==null);},timeoutMs);
    child.once('exit',onExit);
  });
}
function delay(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function closeBrowser(browser,browserServer){
  if(browser){
    await Promise.race([browser.close().catch(()=>{}),delay(5000)]);
  }
  if(!browserServer)return;
  const killing=browserServer.kill().then(()=>true,()=>true);
  if(await Promise.race([killing,delay(5000).then(()=>false)]))return;
  const browserProcess=browserServer.process();
  if(browserProcess?.pid){
    if(process.platform==='win32'){
      const killer=spawn('taskkill.exe',['/PID',String(browserProcess.pid),'/T','/F'],{stdio:'ignore'});
      await Promise.race([new Promise(resolve=>killer.once('exit',resolve)),delay(3000)]);
    }else browserProcess.kill('SIGKILL');
  }
  await Promise.race([killing,delay(1000)]);
}
if(argv.includes('--help')){console.log(usage);process.exit(0);}
const videoPath=path.resolve(option('--video',defaultVideo));
const durationSeconds=Number(option('--duration','60'));
const gpuValidation=option('--gpu-validation','on');
const gpuFusedApply=option('--gpu-fused-apply','on');
const hud=option('--hud','on');
const outputDir=path.resolve(option('--output-dir',path.join(os.homedir(),'Downloads')));
const headed=argv.includes('--headed');
if(!Number.isInteger(durationSeconds)||durationSeconds<5||durationSeconds>3600)throw new Error('--duration must be an integer from 5 to 3600 seconds.');
if(!['on','off'].includes(gpuValidation))throw new Error('--gpu-validation must be on or off.');
if(!['on','off'].includes(gpuFusedApply))throw new Error('--gpu-fused-apply must be on or off.');
if(!['on','off'].includes(hud))throw new Error('--hud must be on or off.');

const sourceHasher=createHash('sha256');
try{for await(const chunk of createReadStream(videoPath))sourceHasher.update(chunk);}catch(error){throw new Error(`Cannot read video ${videoPath}: ${error.message}\n\n${usage}`);}
const expectedSourceHash=sourceHasher.digest('hex');
const expectedRevision=execFileSync('git',['rev-parse','HEAD'],{cwd:repoRoot,encoding:'utf8'}).trim();

async function freePort(){
  const server=createServer();
  await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
  const port=server.address().port;
  await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  return port;
}
const port=await freePort();
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--config','vite.benchmark.config.ts','--host','127.0.0.1','--port',String(port)],{cwd:repoRoot,stdio:['ignore','pipe','pipe']});
let serverOutput='';
server.stdout.on('data',data=>serverOutput+=data.toString());
server.stderr.on('data',data=>serverOutput+=data.toString());
const baseUrl=`http://127.0.0.1:${port}`;
let browser;
let browserServer;
try{
  let ready=false;
  for(let attempt=0;attempt<120;attempt++){
    if(server.exitCode!==null)throw new Error(`Benchmark server exited early.\n${serverOutput}`);
    try{const response=await fetch(baseUrl);if(response.ok){ready=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  if(!ready)throw new Error(`Timed out waiting for benchmark server.\n${serverOutput}`);

  browserServer=await chromium.launchServer({channel:'chrome',headless:!headed,args:['--enable-unsafe-webgpu']});
  browser=await chromium.connect(browserServer.wsEndpoint());
  const context=await browser.newContext({acceptDownloads:true});
  const page=await context.newPage();
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')pageErrors.push(message.text());});
  await page.goto(`${baseUrl}/?gpu=tapesat&gpu-profile=1&gpu-validation=${gpuValidation}&gpu-fused-apply=${gpuFusedApply}&gpu-hud=${hud}`,{waitUntil:'domcontentloaded'});
  await page.locator('#card-input .rack-card-header').click();
  await page.locator('#card-sound .rack-card-header').click();
  await page.locator('#slider-resolution-mount').getByRole('button',{name:'720p',exact:true}).click();
  await page.locator('#slider-volume').evaluate(element=>{element.value='0';element.dispatchEvent(new Event('input',{bubbles:true}));});
  await page.locator('#btn-toggle-audio').click();
  await page.locator('#input-video-file').setInputFiles(videoPath);
  await page.locator('#perf-badge').waitFor({state:'visible'});

  const gpuDeadline=Date.now()+30000;
  while(Date.now()<gpuDeadline){
    const badge=await page.locator('#perf-badge').textContent()??'';
    if(badge.includes('| GPU |'))break;
    if(badge.includes('| JS |')||badge.includes('fallback'))throw new Error(`GPU backend did not activate. Badge: ${badge}\n${pageErrors.join('\n')}`);
    await page.waitForTimeout(250);
  }
  const initialBadge=await page.locator('#perf-badge').textContent()??'';
  if(!initialBadge.includes('| GPU |'))throw new Error(`GPU backend did not activate within 30 seconds. Badge: ${initialBadge}\n${pageErrors.join('\n')}`);
  await page.locator('#gpu-main-canvas').waitFor({state:'visible'});
  console.log(`Running ${durationSeconds}s measured 720p session on ${path.basename(videoPath)} (GPU validation ${gpuValidation}, HUD ${hud}).`);

  const measureDeadline=Date.now()+(durationSeconds+150)*1000;
  try{
    await page.waitForFunction(target=>{
      const badge=document.querySelector('#perf-badge')?.textContent??'';
      if(!badge.includes('| GPU |'))return false;
      const match=badge.match(/\/\s*([\d.]+)s measured/);
      return Boolean(match)&&Number(match[1])>=target;
    },durationSeconds,{timeout:Math.max(1000,measureDeadline-Date.now()),polling:500});
  }catch(error){
    const state=await page.evaluate(()=>({
      badge:document.querySelector('#perf-badge')?.textContent??null,
      video:[...document.querySelectorAll('video')].map(element=>({paused:element.paused,ended:element.ended,readyState:element.readyState,currentTime:element.currentTime,duration:element.duration,videoWidth:element.videoWidth,videoHeight:element.videoHeight})),
      visibility:document.visibilityState,
    })).catch(()=>null);
    throw new Error(`${error.message}\nBenchmark state: ${JSON.stringify(state)}\nPage errors: ${pageErrors.join('\n')}`);
  }

  const downloadEvent=page.waitForEvent('download');
  await page.locator('#perf-badge').click();
  const download=await downloadEvent;
  const reportPath=path.join(outputDir,download.suggestedFilename());
  await fs.mkdir(outputDir,{recursive:true});
  await download.saveAs(reportPath);
  const report=JSON.parse(await fs.readFile(reportPath,'utf8'));
  const problems=[];
  if(report.source?.sha256!==expectedSourceHash)problems.push(`source hash mismatch (${report.source?.sha256??'missing'})`);
  if(report.build?.revision!==expectedRevision)problems.push(`build revision mismatch (${report.build?.revision??'missing'} vs ${expectedRevision})`);
  if(!report.gpuInternalTimings?.gpuValidationErrorScopeMs||!report.gpuInternalTimings?.gpuReadbackMapMs)problems.push('new error-scope/readback timing fields are missing');
  if(report.gpuPerFrameValidation!==(gpuValidation==='on'))problems.push(`per-frame validation mismatch (${report.gpuPerFrameValidation} vs ${gpuValidation})`);
  if(report.gpuFusedApplyFinish!==(gpuFusedApply==='on'))problems.push(`fused apply mismatch (${report.gpuFusedApplyFinish} vs ${gpuFusedApply})`);
  if(report.hudEnabled!==(hud==='on'))problems.push(`HUD state mismatch (${report.hudEnabled} vs ${hud})`);
  if(pageErrors.length)problems.push(`${pageErrors.length} browser console/page errors`);
  console.log(JSON.stringify({
    report:reportPath,revision:report.build?.revision,dirty:report.build?.dirty,sourceSha256:report.source?.sha256,
    measuredSeconds:report.measuredSeconds,processedFps:report.processedFps,missedPresentedCallbacks:report.missedPresentedCallbacks,
    framePathMs:report.timings?.framePathMs,gpuCompletionAndReadbackMs:report.timings?.gpuCompletionAndReadbackMs,
    gpuValidationErrorScopeMs:report.gpuInternalTimings?.gpuValidationErrorScopeMs,gpuReadbackMapMs:report.gpuInternalTimings?.gpuReadbackMapMs,
    captureMode:report.gpuValidation?.captureMode,fidelityPassed:Boolean(report.gpuValidation?.sample?.passed&&report.gpuValidation?.resident?.passed),
    gpuPerFrameValidation:report.gpuPerFrameValidation,gpuFusedApplyFinish:report.gpuFusedApplyFinish,hudEnabled:report.hudEnabled,audioMuted:report.audioMuted,audioContextState:report.audioContextState,problems,
  },null,2));
  if(problems.length)process.exitCode=1;
}finally{
  await closeBrowser(browser,browserServer);
  if(server.exitCode===null){
    server.kill('SIGTERM');
    if(!await waitForExit(server,2000)&&process.platform==='win32'){
      const killer=spawn('taskkill.exe',['/PID',String(server.pid),'/T','/F'],{stdio:'ignore'});
      await waitForExit(killer,3000);
      await waitForExit(server,2000);
    }
  }
}
if(process.exitCode===undefined)process.exitCode=0;
await new Promise(resolve=>process.stdout.write('',resolve));
process.exit(process.exitCode);
