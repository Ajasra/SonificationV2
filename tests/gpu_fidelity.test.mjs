import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function load(filename) {
  filename=path.resolve(filename);
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,Float32Array,require:name=>load(path.resolve(path.dirname(filename),name))});
  return exports;
}
const {checkGpuFidelity}=load('src/benchmark/gpu-fidelity.ts');
const {TapeSaturationFilter}=load('src/engine/filters/lofi/tapesat.ts');
function fakeGpu(error=0) {
  let cpu, rate, resets=0;
  return {reset(){cpu=undefined;resets++;},get resets(){return resets;},async process(input,params,sr){
    if(!cpu || rate!==sr){cpu=new TapeSaturationFilter(sr);rate=sr;}
    cpu.setParams(params);const result=input.slice();cpu.processBlock(result);
    if(error) for(let i=0;i<result.length;i++) result[i]+=error;
    return result;
  }};
}
test('GPU preflight checks full frames and restores clean state',async()=>{
  const gpu=fakeGpu();const result=await checkGpuFidelity(gpu);
  assert.equal(result.passed,true);assert.equal(result.cases.length,3);
  assert.ok(result.cases[1].samples>2*1280*720*3);
  assert.equal(result.cases[1].maxAbsoluteError,0);assert.equal(gpu.resets,4);
});
test('GPU preflight rejects excessive finite error without weakening limits',async()=>{
  const result=await checkGpuFidelity(fakeGpu(.001));
  assert.equal(result.passed,false);assert.equal(result.limits.maxAbsoluteError,1e-4);
});
test('GPU preflight honours cancellation before processing',async()=>{
  const gpu=fakeGpu();await assert.rejects(checkGpuFidelity(gpu,()=>true),/cancelled/);
  assert.equal(gpu.resets,1);
});
