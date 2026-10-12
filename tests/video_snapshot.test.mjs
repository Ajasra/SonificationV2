import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function harness(){
  let frame,complete,closed=0,cancelled=0,playing=false;
  const bitmap={close(){closed++;}};
  const video={requestVideoFrameCallback(callback){frame=callback;return 1;},cancelVideoFrameCallback(){cancelled++;},async play(){playing=true;},pause(){playing=false;}};
  const exports={};
  const code=ts.transpileModule(fs.readFileSync('src/benchmark/video-snapshot.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,setTimeout,clearTimeout,createImageBitmap:()=>new Promise(resolve=>{complete=()=>resolve(bitmap);})});
  return {capture:exports.snapshotVideoFrame,video,bitmap,deliver(){frame();},complete(){complete();},get closed(){return closed;},get cancelled(){return cancelled;},get playing(){return playing;}};
}
test('snapshot waits for a delivered frame, then freezes playback',async()=>{
  const h=harness();const pending=h.capture(h.video,new AbortController().signal);
  assert.equal(h.playing,true);h.deliver();h.complete();assert.equal(await pending,h.bitmap);assert.equal(h.playing,false);
});
test('snapshot cancellation removes pending frame callback',async()=>{
  const h=harness(),controller=new AbortController();const pending=h.capture(h.video,controller.signal);
  controller.abort();await assert.rejects(pending,/cancelled/);assert.equal(h.cancelled,1);assert.equal(h.playing,false);
});
test('snapshot arriving after cancellation is closed',async()=>{
  const h=harness(),controller=new AbortController();const pending=h.capture(h.video,controller.signal);
  h.deliver();controller.abort();await assert.rejects(pending,/cancelled/);h.complete();await Promise.resolve();await Promise.resolve();assert.equal(h.closed,1);
});
