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
