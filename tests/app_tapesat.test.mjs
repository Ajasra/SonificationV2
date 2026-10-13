import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const cache=new Map();
function load(file){
  const filename=path.resolve(file);if(cache.has(filename))return cache.get(filename);
  if(filename.endsWith(path.normalize('filters/factory.ts')))return {createFilterInstance:(type,rate)=>{assert.equal(type,'tapesat');return new (load('src/engine/filters/lofi/tapesat.ts').TapeSaturationFilter)(rate);}};
  if(filename.endsWith(path.normalize('video-filters/factory.ts')))return {};
  const exports={};cache.set(filename,exports);
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,Float32Array,Uint8ClampedArray,performance,console,require:name=>load(path.resolve(path.dirname(filename),name))},{filename});return exports;
}
const {eligibleTapeSat}=load('src/engine/backends/app-tapesat.ts');
const {SonificationPipeline}=load('src/engine/pipeline.ts');
function preset(){const stream={rawType:'INTERLEAVED',law:'NONE',sign:'UNSIGNED',bits:8,endianess:'LITTLE_ENDIAN',colorSpace:'RGB'};return {id:'test',name:'test',reader:{...stream},writer:{...stream},filters:[{id:'sat',type:'tapesat',enabled:true,sampleRate:44100,params:{drive:2.5,bias:.1,bump:.4,bumpHz:80,tone:8000}}],videoFilters:[],equalize:false,blendMode:'NONE',blendAmount:0};}
test('application GPU eligibility is limited to the validated format and rack',()=>{
  const p=preset();assert.equal(eligibleTapeSat(p,1280,720),p.filters[0]);
  for(const mutate of [p=>p.reader.bits=16,p=>p.writer.rawType='PLANAR',p=>p.reader.law='A_LAW',p=>p.equalize=true,p=>p.blendMode='ADD',p=>p.filters[0].sampleRate=48000,p=>p.filters.push({...p.filters[0],id:'extra'}),p=>p.videoFilters.push({id:'v',type:'crt',enabled:true,params:{}})]){const candidate=preset();mutate(candidate);assert.equal(eligibleTapeSat(candidate,1280,720),undefined);}
  assert.equal(eligibleTapeSat(p,640,480),undefined);
});
test('pipeline state handoff preserves TapeSat continuity within f32 limits',()=>{
  const a=new SonificationPipeline(),b=new SonificationPipeline(),p=preset();
  const input=Uint8ClampedArray.from({length:65*47*4},(_,i)=>i%4===3?255:(i*37)%256);
  a.processFrame(input,65,47,p);b.processFrame(input,65,47,p);
  const state=b.tapeSatState(p,65,47,'sat');assert.notEqual(state.toneLp,0);
  b.tapeSatState(p,65,47,'sat',{...state,bumpLp:Math.fround(state.bumpLp),toneLp:Math.fround(state.toneLp)});
  const expected=a.processFrame(input,65,47,p).audioSamples.slice();
  const actual=b.processFrame(input,65,47,p).audioSamples;
  for(let i=0;i<expected.length;i++)assert.ok(Math.abs(expected[i]-actual[i])<=1e-6);
  assert.throws(()=>b.tapeSatState(p,65,47,'sat',{...state,sampleRate:48000}),/Invalid TapeSat state/);
  p.filters[0].sampleRate=48000;assert.equal(b.tapeSatState(p,65,47,'sat').toneLp,0);
});

function controllerHarness(captureMode='reference-bytes'){
  let creates=0,disposed=0,rejectFrame=false,resolveCreate,rgbaCalls=0,imageCalls=0;
  const runtime={captureMode,adapterInfo:{vendor:'',architecture:'',device:'',description:''},dispose(){disposed++;},configureCanvas(){return {unconfigure(){}};},seedState(){},async processRgba(){rgbaCalls++;if(rejectFrame)throw new Error('device lost');return new Float32Array(8194);},async processImage(){imageCalls++;if(rejectFrame)throw new Error('device lost');return new Float32Array(8194);}};
  const exports={};const code=ts.transpileModule(fs.readFileSync('src/engine/backends/app-tapesat.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,console:{warn(){}},document:{createElement:()=>({style:{},getContext:()=>({putImageData(){}})})},require:name=>name.includes('webgpu-tapesat')?{WebGpuTapeSat:{create:()=>{creates++;return new Promise(resolve=>resolveCreate=()=>resolve(runtime));}}}:name.includes('gpu-fidelity')?{checkGpuFidelity:async()=>({passed:true}),selectResidentCapture:async()=>({fidelity:{passed:true},textureProbe:null,captureMode:runtime.captureMode})}:{resolveChain:()=>[]}});
  const controller=new exports.AppTapeSatGpu({style:{},insertAdjacentElement(){}});
  return {controller,resolve(){resolveCreate();},fail(){rejectFrame=true;},get creates(){return creates;},get disposed(){return disposed;},get rgbaCalls(){return rgbaCalls;},get imageCalls(){return imageCalls;}};
}
test('source cancellation disposes a late-created GPU device',async()=>{
  const h=controllerHarness();const pending=h.controller.process({},()=>({data:{data:new Uint8ClampedArray()},durationMs:0}),{}, {bumpLp:0,toneLp:0});h.controller.reset();h.resolve();assert.equal(await pending,undefined);assert.equal(h.disposed,1);
});
test('GPU processing failure falls back once and source reset permits retry',async()=>{
  const capture=()=>({data:{data:new Uint8ClampedArray()},durationMs:0});
  const h=controllerHarness();h.fail();const pending=h.controller.process({},capture,{}, {bumpLp:0,toneLp:0});h.resolve();assert.equal(await pending,undefined);
  assert.equal(await h.controller.process({},capture,{}, {bumpLp:0,toneLp:0}),undefined);assert.equal(h.creates,1);assert.equal(h.disposed,1);
  h.controller.reset();const next=h.controller.process({},capture,{}, {bumpLp:0,toneLp:0});h.resolve();assert.equal(await next,undefined);assert.equal(h.creates,2);
});
test('proven texture capture skips per-frame CPU pixel readback',async()=>{
  const h=controllerHarness('texture'),source={},capture=()=>{throw new Error('CPU pixel readback should be skipped');};
  const pending=h.controller.process(source,capture,{}, {bumpLp:0,toneLp:0});h.resolve();
  assert.equal((await pending).length,8194);assert.equal(h.imageCalls,1);assert.equal(h.rgbaCalls,0);
});
