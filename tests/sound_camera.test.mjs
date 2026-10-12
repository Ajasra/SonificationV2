import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('compact playback keeps every sample and page cleanup closes the audio graph',()=>{
  const channels=[],contexts=[];let stopped=0,started=0;
  class Context {
    state='running';currentTime=0;destination={};
    constructor(){contexts.push(this);}
    createGain(){return {gain:{value:0,setValueAtTime(){}},connect(){}};}
    createAnalyser(){return {connect(){},context:this};}
    createBuffer(_channels,n){const channel=new Float32Array(n);channels.push(channel);return {getChannelData:()=>channel};}
    createMediaStreamDestination(){return {stream:{}};}
    createBufferSource(){return {connect(){},disconnect(){},start(){started++;},stop(){stopped++;}};}
    close(){this.state='closed';return Promise.resolve();}
  }
  const exports={};const code=ts.transpileModule(fs.readFileSync('src/audio/sound-camera.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  vm.runInNewContext(code,{exports,console,window:{AudioContext:Context}});
  const audio=new exports.SoundCameraAudio();audio.init();audio.setMuted(false);
  const compact=Float32Array.from({length:4096},(_,i)=>Math.sin(i*.1));audio.playFrameSamples(compact);
  assert.deepEqual(channels[0],compact);assert.equal(started,1);
  audio.dispose();assert.equal(stopped,1);assert.equal(contexts[0].state,'closed');assert.equal(audio.getAnalyser(),null);
  audio.playFrameSamples(compact);assert.equal(started,1);audio.init();assert.equal(contexts.length,2);audio.dispose();
});
