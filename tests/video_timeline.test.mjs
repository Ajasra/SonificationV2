import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

function load(file, globals = {}) {
  const filename = path.resolve(file);
  const source = fs.readFileSync(filename, 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    console: { warn() {}, error() {}, log() {} },
    document: {
      getElementById: () => null,
      createElement: () => ({ appendChild() {}, style: {} }),
      body: { classList: { add() {}, remove() {} } },
    },
    window: { addEventListener() {} },
    ...globals,
  }, { filename });
  return exports;
}

test('VideoTimeline initializes with full duration loop boundaries', () => {
  const { VideoTimeline } = load('src/ui/video-timeline.ts');
  const timeline = new VideoTimeline({
    onSeek: () => {},
    onRangeChange: () => {},
    onTogglePlayPause: () => {},
  });

  const mockVideo = { duration: 12.5, currentTime: 0, paused: false };
  timeline.attachVideo(mockVideo);

  const range = timeline.getLoopRange();
  assert.equal(range.start, 0);
  assert.equal(range.end, 12.5);
});

test('VideoTimeline checkLoopBoundaries wraps to start upon reaching end mark', () => {
  const { VideoTimeline } = load('src/ui/video-timeline.ts');
  const timeline = new VideoTimeline({
    onSeek: () => {},
    onRangeChange: () => {},
    onTogglePlayPause: () => {},
  });

  const mockVideo = { duration: 20.0, currentTime: 2.0, paused: false };
  timeline.attachVideo(mockVideo);

  // Set A-B loop slice from 3.0s to 8.0s
  timeline.setLoopRange(3.0, 8.0);
  const range = timeline.getLoopRange();
  assert.equal(range.start, 3.0);
  assert.equal(range.end, 8.0);

  // Within bounds
  assert.equal(timeline.checkLoopBoundaries(5.0), null);
  assert.equal(timeline.checkLoopBoundaries(7.99), null);

  // Reached or passed end mark (8.0s) -> wrap to start mark (3.0s)
  assert.equal(timeline.checkLoopBoundaries(8.0), 3.0);
  assert.equal(timeline.checkLoopBoundaries(8.5), 3.0);

  // Before start mark (e.g. user seeked prior to loop window) -> wrap to start mark (3.0s)
  assert.equal(timeline.checkLoopBoundaries(1.0), 3.0);
});

test('VideoTimeline resetLoopToFull restores entire video duration', () => {
  const { VideoTimeline } = load('src/ui/video-timeline.ts');
  let rangeChanged = false;
  const timeline = new VideoTimeline({
    onSeek: () => {},
    onRangeChange: (s, e) => {
      rangeChanged = true;
      assert.equal(s, 0);
      assert.equal(e, 30.0);
    },
    onTogglePlayPause: () => {},
  });

  const mockVideo = { duration: 30.0, currentTime: 5.0, paused: false };
  timeline.attachVideo(mockVideo);

  // Alter range
  timeline.setLoopRange(5.0, 15.0);
  assert.equal(timeline.getLoopRange().start, 5.0);
  assert.equal(timeline.getLoopRange().end, 15.0);

  // Reset to full
  timeline.resetLoopToFull();
  assert.equal(timeline.getLoopRange().start, 0);
  assert.equal(timeline.getLoopRange().end, 30.0);
  assert.equal(rangeChanged, true);
});

test('MediaController starts playback from start point [A] on rec when video is stopped', async () => {
  const { VideoTimeline } = load('src/ui/video-timeline.ts');
  const { MediaController } = load('src/ui/media-controller.ts', {
    require: (mod) => {
      if (mod.includes('video-timeline')) return { VideoTimeline };
      return {};
    },
    HTMLVideoElement: class {},
    HTMLImageElement: class {},
    Image: class {},
    URL: { createObjectURL: () => 'blob:mock', revokeObjectURL: () => {} },
    window: { setInterval: () => 1, clearInterval: () => {} },
  });

  let recordingStarted = false;
  let videoPlayed = false;
  const mockVideo = {
    duration: 60.0,
    currentTime: 25.0,
    paused: true,
    ended: false,
    seeking: false,
    readyState: 4,
    videoWidth: 640,
    videoHeight: 480,
    play: async () => {
      videoPlayed = true;
      mockVideo.paused = false;
    },
    pause: () => {
      mockVideo.paused = true;
    },
  };

  const controller = new MediaController({
    canvas: { width: 640, height: 480 },
    offscreenCanvas: { width: 640, height: 480 },
    offscreenCtx: { drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(4) }) },
    pipeline: {},
    videoRecorder: {
      getIsRecording: () => recordingStarted,
      startRecording: () => { recordingStarted = true; },
      stopRecording: async () => ({ blob: {}, ext: 'webm' }),
    },
    offlineVideoRecorder: {
      getIsRunning: () => false,
    },
    audioEngine: {
      setIsRecording: () => {},
      getAudioMediaStream: () => null,
      attachMediaElement: () => {},
      detachMediaElement: () => {},
    },
    cameraManager: { stop() {}, isActive: () => false },
    getActivePreset: () => ({}),
    getBusRate: () => 44100,
    getIsSyncMode: () => true,
    isMobileDevice: () => false,
    isFrameProcessing: () => false,
    onFrameProcessed: () => {},
    onCameraStopped: () => {},
    scheduleFrame: () => {},
    stopFrameLoop: () => {},
    getLoopGeneration: () => 1,
  });

  controller.loadedVideoElement = mockVideo;
  controller.getVideoTimeline().attachVideo(mockVideo);
  controller.getVideoTimeline().setLoopRange(4.5, 20.0);

  // Video was stopped at 25.0s, loop start [A] is at 4.5s
  assert.equal(mockVideo.paused, true);
  await controller.toggleVideoRecording();

  assert.equal(mockVideo.currentTime, 4.5);
  assert.equal(videoPlayed, true);
  assert.equal(recordingStarted, true);
  assert.equal(controller.getVideoTimeline().getIsPlaying(), true);

  // If video is already playing, starting recording does not jump back to [A]
  recordingStarted = false;
  mockVideo.currentTime = 12.0;
  mockVideo.paused = false;
  videoPlayed = false;

  await controller.toggleVideoRecording();
  assert.equal(mockVideo.currentTime, 12.0);
  assert.equal(recordingStarted, true);
});
