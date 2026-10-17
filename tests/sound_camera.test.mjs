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

test('SoundCameraAudio supports separate generated sound and source input volumes and routing', () => {
  const gains = [];
  const connections = [];
  class ExtendedContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    createGain() {
      const g = {
        gain: {
          value: 0,
          setValueAtTime(val) { this.value = val; }
        },
        connect(target) { connections.push({ from: g, to: target }); }
      };
      gains.push(g);
      return g;
    }
    createAnalyser() { return { connect() {}, context: this }; }
    createBuffer() { return { getChannelData: () => new Float32Array(4096) }; }
    createMediaStreamDestination() { return { stream: { id: 'dest-stream' } }; }
    createBufferSource() { return { connect() {}, disconnect() {}, start() {}, stop() {} }; }
    createMediaElementSource(el) {
      return {
        connect(target) { connections.push({ from: 'media-element', to: target, element: el }); },
        disconnect() {}
      };
    }
    createMediaStreamSource(st) {
      return {
        connect(target) { connections.push({ from: 'media-stream', to: target, stream: st }); },
        disconnect() {}
      };
    }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }

  const exports = {};
  const code = ts.transpileModule(fs.readFileSync('src/audio/sound-camera.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
  }).outputText;
  vm.runInNewContext(code, { exports, console, window: { AudioContext: ExtendedContext } });

  const audio = new exports.SoundCameraAudio();
  audio.init();

  // Initial volume levels
  assert.equal(audio.getVolume(), 0.5);
  assert.equal(audio.getInputVolume(), 0.7);

  // Set generated and input volume independently
  audio.setVolume(0.25);
  audio.setInputVolume(0.85);
  assert.equal(audio.getVolume(), 0.25);
  assert.equal(audio.getInputVolume(), 0.85);

  // Test video media element attachment
  const mockVideo = { muted: true };
  audio.attachMediaElement(mockVideo);
  assert.equal(mockVideo.muted, false);
  const videoConn = connections.find(c => c.from === 'media-element');
  assert.ok(videoConn, 'media element should be connected to Web Audio graph');

  // Test mic stream attachment
  const mockStream = { id: 'mic-stream' };
  audio.attachMediaStream(mockStream);
  const streamConn = connections.find(c => c.from === 'media-stream');
  assert.ok(streamConn, 'media stream should be connected to Web Audio graph');

  // Stream destination should be available for recording
  const recStream = audio.getAudioMediaStream();
  assert.equal(recStream.id, 'dest-stream');

  audio.dispose();
});
