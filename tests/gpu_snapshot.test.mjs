import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(fail=false) {
  class Canvas {width=1280;height=720;}
  class Video {videoWidth=1280;videoHeight=720;}
  let closed=0,snapshots=0,received;
  const bitmap={close(){closed++;}};
  const exports={};
  const code=ts.transpileModule(fs.readFileSync('src/engine/backends/webgpu-tapesat.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  let drawn;
  const raster=new Canvas();raster.getContext=()=>({drawImage(source){drawn=source;}});
  vm.runInNewContext(code,{exports,performance,document:{createElement:()=>raster},HTMLCanvasElement:Canvas,HTMLVideoElement:Video,require:()=>({LUT_LINEAR_8:new Float32Array(256)}),createImageBitmap:async()=>{snapshots++;return bitmap;}});
  const gpu=Object.create(exports.WebGpuTapeSat.prototype);
  gpu.execute=async(...args)=>{received=args[4].source;if(fail)throw new Error('GPU failed');gpu.lastTimings={gpuPrepareSubmitMs:1};return new Float32Array(6144);};
  return {gpu,canvas:new Canvas(),video:new Video(),bitmap,raster,get drawn(){return drawn;},get closed(){return closed;},get snapshots(){return snapshots;},get received(){return received;}};
}
test('video snapshot remains owned through processing and reports snapshot cost',async()=>{
  const h=harness();await h.gpu.processImage(h.video,{canvas:h.canvas},{},true);
  assert.equal(h.drawn,h.bitmap);assert.equal(h.received,h.raster);assert.equal(h.closed,1);assert.equal(h.snapshots,1);
  assert.ok(h.gpu.lastTimings.gpuSourceSnapshotMs>=0);
});
test('video snapshot closes when processing fails',async()=>{
  const h=harness(true);await assert.rejects(h.gpu.processImage(h.video,{canvas:h.canvas}),/GPU failed/);assert.equal(h.closed,1);
});
test('canvas source uses reference raster and invalid dimensions fail before snapshot',async()=>{
  const h=harness();await h.gpu.processImage(h.canvas,{canvas:h.canvas});assert.equal(h.drawn,h.canvas);assert.equal(h.received,h.raster);assert.equal(h.snapshots,0);
  h.video.videoWidth=640;await assert.rejects(h.gpu.processImage(h.video,{canvas:h.canvas}),/source dimensions/);assert.equal(h.snapshots,0);
});
