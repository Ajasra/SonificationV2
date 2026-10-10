import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import { createRequire } from 'node:module';

const nativeRequire = createRequire(import.meta.url);
function load(file, globals = {}) {
  const filename = path.resolve(file);
  let source = fs.readFileSync(filename, 'utf8');
  if (file.endsWith('main.ts')) source = source.replace('class SonificationApp', 'export class SonificationApp');
  source = source.replace(/import\.meta/g, '({ env: {} })');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, console: { warn() {}, error() {} }, performance, DOMException, setTimeout, clearTimeout,
    require: name => name.endsWith('.ts') ? load(path.resolve(path.dirname(filename), name), globals) : nativeRequire(name),
    ...globals,
  }, { filename });
  return exports;
}
function camera(getUserMedia, extra = {}) {
  const video = { setAttribute() {}, pause() {}, play: async () => {}, readyState: 0, srcObject: null };
  const { CameraManager } = load('src/camera/camera-manager.ts', {
    document: { createElement: () => video }, navigator: { mediaDevices: { getUserMedia } }, ...extra,
  });
  return { manager: new CameraManager(), video };
}
function stream() {
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; } };
  return { track, getTracks: () => [track], getVideoTracks: () => [track] };
}
test('concurrent camera starts share one acquisition', async () => {
  let resolve, calls = 0;
  const { manager } = camera(() => { calls++; return new Promise(r => { resolve = r; }); });
  const first = manager.start();
  assert.equal(manager.start(), first);
  resolve(stream());
  await first;
  assert.equal(calls, 1);
  assert.equal(manager.isActive(), true); // readiness is checked by the render loop
});
test('stop releases a stream that arrives after cancellation', async () => {
  let resolve;
  const { manager, video } = camera(() => new Promise(r => { resolve = r; }));
  const pending = manager.start();
  manager.stop();
  const late = stream();
  resolve(late);
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(late.track.readyState, 'ended');
  assert.equal(video.srcObject, null);
});
test('flip releases the previous track before acquiring the next', async () => {
  const first = stream(), second = stream();
  let calls = 0;
  const { manager } = camera(async constraints => {
    if (calls++) {
      assert.equal(first.track.readyState, 'ended');
      assert.equal(constraints.video.facingMode.ideal, 'user');
      return second;
    }
    return first;
  });
  await manager.start();
  await manager.toggleFacingMode();
  assert.equal(manager.isActive(), true);
  manager.stop();
  assert.equal(second.track.readyState, 'ended');
});
test('permission denial does not trigger repeated acquisition', async () => {
  let calls = 0;
  const { manager } = camera(async () => { calls++; throw new DOMException('Denied', 'NotAllowedError'); });
  await assert.rejects(manager.start(), { name: 'NotAllowedError' });
  assert.equal(calls, 1);
});
test('playback failure releases the acquired camera', async () => {
  const acquired = stream();
  const { manager, video } = camera(async () => acquired);
  video.play = async () => { throw new Error('Playback failed'); };
  await assert.rejects(manager.start());
  assert.equal(acquired.track.readyState, 'ended');
  assert.equal(video.srcObject, null);
});
test('stalled playback times out and releases the camera', async () => {
  let timeout;
  const acquired = stream();
  const { manager, video } = camera(async () => acquired, {
    setTimeout: callback => { timeout = callback; return 1; }, clearTimeout() {},
  });
  video.play = () => new Promise(() => {});
  const pending = manager.start();
  await new Promise(r => setImmediate(r));
  timeout();
  await assert.rejects(pending, { name: 'TimeoutError' });
  assert.equal(acquired.track.readyState, 'ended');
});
test('timeout releases late acquisition and permits retry', async () => {
  let resolve, timeout;
  const { manager } = camera(() => new Promise(r => { resolve = r; }), {
    setTimeout: callback => { timeout = callback; return 1; }, clearTimeout() {},
  });
  const pending = manager.start();
  timeout();
  await assert.rejects(pending, { name: 'TimeoutError' });
  const late = stream(); resolve(late);
  await new Promise(r => setImmediate(r));
  assert.equal(late.track.readyState, 'ended');
  const retry = manager.start(); resolve(stream()); await retry;
  assert.equal(manager.isActive(), true);
});
test('camera flip explicitly restarts rendering and rejects duplicate taps', async () => {
  const { SonificationApp } = load('src/main.ts', { window: { addEventListener() {} } });
  const app = Object.create(SonificationApp.prototype);
  let resolve, stopped = 0, restarted = 0, flips = 0;
  app.cameraManager = { isActive: () => true, toggleFacingMode: () => { flips++; return new Promise(r => { resolve = r; }); } };
  app.stopFrameLoop = () => stopped++;
  app.startLiveLoop = () => restarted++;
  app.updateCamToggleUI = () => {};
  const flip = app.flipCamera(); await app.flipCamera(); resolve(); await flip;
  assert.equal(flips, 1); assert.equal(stopped, 1); assert.equal(restarted, 1);
});
test('cancel both video callbacks and animation callbacks', () => {
  let cancelledVideo, cancelledAnimation;
  const { SonificationApp } = load('src/main.ts', {
    window: { addEventListener() {} }, cancelAnimationFrame: id => { cancelledAnimation = id; },
  });
  const app = Object.create(SonificationApp.prototype);
  Object.assign(app, { loopGeneration: 0, animFrameId: 3, videoFrameId: 7, frameVideo: { cancelVideoFrameCallback: id => { cancelledVideo = id; } } });
  app.stopFrameLoop();
  assert.equal(cancelledAnimation, 3); assert.equal(cancelledVideo, 7); assert.equal(app.loopGeneration, 1);
});
for (const name of ['CompressorFilter', 'NoiseGateFilter']) {
  test(`${name} preserves history across unchanged parameter updates`, () => {
    const Class = load('src/engine/filters/dynamics.ts')[name];
    const reference = new Class(), updated = new Class();
    const params = reference.getParams();
    reference.setParams(params); updated.setParams(params);
    reference.processBlock(new Float32Array(2048).fill(0.75));
    updated.processBlock(new Float32Array(2048).fill(0.75));
    updated.setParams(params);
    const expected = new Float32Array(2048).fill(0.01), actual = expected.slice();
    reference.processBlock(expected); updated.processBlock(actual);
    assert.deepEqual(actual, expected);
  });
}
test('every factory study renders finite samples', () => {
  const { FACTORY_PRESETS } = load('src/presets/factory-presets.ts');
  const { SonificationPipeline } = load('src/engine/pipeline.ts');
  const pixels = new Uint8ClampedArray(64 * 48 * 4);
  for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 37) % 256;
  for (const preset of FACTORY_PRESETS) {
    const pipeline = new SonificationPipeline();
    for (let frame = 0; frame < 3; frame++) {
      const result = pipeline.processFrame(pixels, 64, 48, preset);
      assert.ok(result.audioSamples.every(Number.isFinite), preset.name);
      assert.equal(result.outputRgba.length, pixels.length);
    }
  }
});
test('modified factory studies retain parameters when shared', () => {
  const { PresetManager } = load('src/presets/preset-manager.ts', { localStorage: { getItem: () => null }, btoa, atob });
  const manager = new PresetManager();
  const original = manager.getAllPresets()[0];
  assert.equal(manager.encodePresetToHash(original), `#preset=${original.id}`);
  const modified = JSON.parse(JSON.stringify(original));
  modified.blendAmount = 0.12345;
  const hash = manager.encodePresetToHash(modified);
  assert.ok(hash.startsWith('#z='));
  assert.equal(manager.decodePresetFromHash(hash).blendAmount, 0.12345);

  // Backward compatibility with legacy #p= hashes
  const legacyHash = `#p=${btoa(encodeURIComponent(JSON.stringify(modified)))}`;
  assert.equal(manager.decodePresetFromHash(legacyHash).blendAmount, 0.12345);
});
