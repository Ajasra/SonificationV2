import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const file = path.resolve('src/engine/backends/gpu-eligibility.ts');
const exports = {};
const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
vm.runInNewContext(code, { exports, require: name => name.endsWith('/chain.ts') ? { resolveChain(preset) {
  const out = [];
  for (const ref of preset.chain ?? []) {
    const list = ref.kind === 'video' ? preset.videoFilters : preset.filters;
    const cfg = list.find(node => node.id === ref.id);
    if (cfg) out.push({ kind: ref.kind, cfg });
  }
  return out;
} } : {} }, { filename: file });

const video = (id, type) => ({ id, type, enabled: true, params: {} });
const audio = (id, type) => ({ id, type, enabled: true, sampleRate: 44100, params: {} });
function rack(nodes) {
  const stream = { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' };
  const normalized=nodes.map(node=>({kind:node.kind??('sampleRate' in node?'audio':'video'),cfg:node.cfg??node}));
  return { id: 'route-test', name: 'route-test', reader: { ...stream }, writer: { ...stream }, equalize: false, blendMode: 'NONE', blendAmount: 0,
    filters: normalized.filter(node => node.kind === 'audio').map(node => node.cfg), videoFilters: normalized.filter(node => node.kind === 'video').map(node => node.cfg),
    chain: normalized.map(node => ({ kind: node.kind, id: node.cfg.id })) };
}
function plan(preset, requested = 'auto') {
  return exports.planApplicationRoute({ requested, preset, width: 1280, height: 720, webGpuAvailable: true, releaseEnabled: false, fileVideo: true, cameraActive: false });
}

test('static route plans explain R0, R2, R3 and mixed-order R5 boundaries', () => {
  assert.deepEqual(Object.keys(exports.GPU_FILTER_CAPABILITIES), ['tapesat', 'procamp', 'solarizer', 'colorizer', 'cvislicer', 'differentiator']);
  assert.equal(exports.getGpuFilterCapability('tapesat').executor, 'app-tapesat');
  assert.equal(exports.getGpuFilterCapability('differentiator').segment, 'shared-webgpu-rack');
  assert.equal(exports.getGpuFilterCapability('moogladder'), undefined);
  assert.equal(exports.hasGpuFilterImplementation('tapesat'), true);
  assert.equal(exports.hasGpuVideoImplementation('solarizer'), true);
  assert.equal(exports.hasGpuVideoImplementation('crtbloom'), false);
  const r0 = plan(rack([]));
  assert.equal(r0.selectedRouteId, 'cpu-reference');
  assert.deepEqual(Array.from(r0.videoSuffixNodeIds), []);

  const spatial = [video('p', 'procamp'), video('s', 'solarizer'), video('c', 'colorizer')];
  const r2 = plan(rack(spatial));
  assert.equal(r2.selectedRouteId, 'cpu-reference');
  assert.deepEqual(Array.from(r2.cpuPrefixNodeIds), []);
  assert.deepEqual(Array.from(r2.videoSuffixNodeIds), ['p', 's', 'c']);

  const r3 = plan(rack([audio('sat', 'tapesat'), ...spatial]));
  assert.deepEqual(Array.from(r3.cpuPrefixNodeIds), ['sat']);
  assert.deepEqual(Array.from(r3.videoSuffixNodeIds), ['p', 's', 'c']);
  const r3Resident = exports.planApplicationRoute({ requested: 'gpu-resident-rack', preset: rack([audio('sat', 'tapesat'), ...spatial]), width: 1280, height: 720, webGpuAvailable: true, releaseEnabled: false, videoTailAvailable: true, fileVideo: true, cameraActive: false });
  assert.equal(r3Resident.selectedRouteId, 'gpu-resident-rack');
  assert.deepEqual(Array.from(r3Resident.cpuPrefixNodeIds), []);
  assert.deepEqual(Array.from(r3Resident.videoSuffixNodeIds), ['p', 's', 'c']);
  assert.deepEqual(exports.eligibleResidentVideoRack(rack([audio('sat', 'tapesat'), ...spatial]), 1280, 720).video.map(node => node.id), ['p', 's', 'c']);
  const r3Tail = exports.planApplicationRoute({ requested: 'cpu-gpu-video-tail', preset: rack([audio('sat', 'tapesat'), ...spatial]), width: 1280, height: 720, webGpuAvailable: true, releaseEnabled: false, videoTailAvailable: true, fileVideo: true, cameraActive: false });
  assert.equal(r3Tail.selectedRouteId, 'cpu-gpu-video-tail');
  assert.deepEqual(Array.from(r3Tail.cpuPrefixNodeIds), ['sat', 'p']);
  assert.deepEqual(Array.from(r3Tail.videoSuffixNodeIds), ['s', 'c']);
  const r2Tail = exports.planApplicationRoute({ requested: 'cpu-gpu-video-tail', preset: rack(spatial), width: 1280, height: 720, webGpuAvailable: true, releaseEnabled: false, videoTailAvailable: true, fileVideo: true, cameraActive: false });
  assert.deepEqual(Array.from(r2Tail.cpuPrefixNodeIds), ['p']);
  assert.deepEqual(Array.from(r2Tail.videoSuffixNodeIds), ['s', 'c']);

  const cviRack = rack([...spatial, video('v01-cvislicer', 'cvislicer')]);
  const cviTail = exports.planApplicationRoute({ requested: 'cpu-gpu-video-tail', preset: cviRack, width: 1280, height: 720, webGpuAvailable: true, releaseEnabled: false, videoTailAvailable: true, fileVideo: true, cameraActive: false });
  assert.equal(cviTail.selectedRouteId, 'cpu-gpu-video-tail');
  assert.deepEqual(Array.from(cviTail.videoSuffixNodeIds), ['s', 'c', 'v01-cvislicer']);
  assert.deepEqual(Array.from(cviTail.cpuPrefixNodeIds), ['p']);
  const crtRack = rack([...spatial, video('v02-crtbloom', 'crtbloom')]);
  const crtTail = exports.planApplicationRoute({ requested: 'cpu-gpu-video-tail', preset: crtRack, width: 1280, height: 720, webGpuAvailable: true, releaseEnabled: false, videoTailAvailable: true, fileVideo: true, cameraActive: false });
  assert.equal(crtTail.selectedRouteId, 'cpu-reference');
  assert.deepEqual(Array.from(crtTail.videoSuffixNodeIds), []);
  const diffRack = rack([...spatial, video('v05-differentiator', 'differentiator')]);
  const diffTail = exports.planApplicationRoute({ requested: 'cpu-gpu-video-tail', preset: diffRack, width: 1280, height: 720, webGpuAvailable: true, releaseEnabled: false, videoTailAvailable: true, fileVideo: true, cameraActive: false });
  assert.equal(diffTail.selectedRouteId, 'cpu-gpu-video-tail');
  assert.deepEqual(Array.from(diffTail.videoSuffixNodeIds), ['s', 'c', 'v05-differentiator']);
  const scanRack = rack([...spatial, video('v06-scanimate', 'scanimate')]);
  const scanTail = exports.planApplicationRoute({ requested: 'cpu-gpu-video-tail', preset: scanRack, width: 1280, height: 720, webGpuAvailable: true, releaseEnabled: false, videoTailAvailable: true, fileVideo: true, cameraActive: false });
  assert.equal(scanTail.selectedRouteId, 'cpu-reference');
  assert.deepEqual(Array.from(scanTail.videoSuffixNodeIds), []);

  const r5 = plan(rack([video('p', 'procamp'), audio('m', 'moogladder'), video('c', 'colorizer')]));
  assert.deepEqual(Array.from(r5.cpuPrefixNodeIds), ['p', 'm']);
  assert.deepEqual(Array.from(r5.videoSuffixNodeIds), ['c']);
  assert.equal(r5.selectedRouteId, 'cpu-reference');
});

test('forced unsupported routes fall back explicitly and auto falls back when no executor is available', () => {
  const r2 = rack([video('p', 'procamp'), video('s', 'solarizer'), video('c', 'colorizer')]);
  const forced = plan(r2, 'cpu-gpu-video-tail');
  assert.equal(forced.selectedRouteId, 'cpu-reference');
  assert.match(forced.fallbackReason, /executor|loaded file source/);
  const auto = exports.planApplicationRoute({ requested: 'auto', preset: r2, width: 1280, height: 720, webGpuAvailable: true, releaseEnabled: true, fileVideo: true, cameraActive: false });
  assert.equal(auto.selectedRouteId, 'cpu-reference');
  assert.equal(auto.fallbackReason, undefined);
});

test('auto selects the best available GPU segment and retains CPU fallback when constraints fail', () => {
  const r3 = rack([audio('sat', 'tapesat'), video('p', 'procamp'), video('s', 'solarizer'), video('c', 'colorizer')]);
  const released = input => exports.planApplicationRoute({
    requested: 'auto', preset: r3, width: 1280, height: 720, webGpuAvailable: true,
    releaseEnabled: true, videoTailAvailable: true, fileVideo: true, cameraActive: false,
    ...input,
  });
  assert.equal(released({}).selectedRouteId, 'gpu-resident-rack');
  assert.equal(released({ releaseEnabled: false }).selectedRouteId, 'gpu-resident-rack');
  assert.equal(released({ videoTailAvailable: false }).selectedRouteId, 'cpu-reference');
  assert.equal(released({ width: 854, height: 480 }).selectedRouteId, 'cpu-reference');
  assert.equal(released({ cameraActive: true }).selectedRouteId, 'cpu-reference');
  assert.equal(released({ fileVideo: false }).selectedRouteId, 'cpu-reference');

  const unsupported = rack([audio('sat', 'tapesat'), video('p', 'procamp'), video('m', 'moogladder'), video('c', 'colorizer')]);
  const fallback = exports.planApplicationRoute({ requested: 'auto', preset: unsupported, width: 1280, height: 720,
    webGpuAvailable: true, releaseEnabled: true, videoTailAvailable: true, fileVideo: true, cameraActive: false });
  assert.equal(fallback.selectedRouteId, 'cpu-gpu-video-tail');
  assert.deepEqual(Array.from(fallback.cpuPrefixNodeIds), ['sat', 'p', 'm']);
  assert.deepEqual(Array.from(fallback.videoSuffixNodeIds), ['c']);
});

test('auto selects a supported final GPU suffix without the release flag and keeps its CPU prefix', () => {
  const chain = rack([video('p', 'procamp'), audio('m', 'moogladder'), video('s', 'solarizer'), video('c', 'colorizer')]);
  assert.equal(exports.shouldEnableTapeSatGpu(null, true), true);
  assert.equal(exports.shouldEnableTapeSatGpu(null, false), false);
  assert.equal(exports.shouldEnableTapeSatGpu('js', true), false);
  const automatic = exports.planApplicationRoute({
    requested: 'auto', preset: chain, width: 1280, height: 720, webGpuAvailable: true,
    videoTailAvailable: true, fileVideo: true, cameraActive: false,
  });
  assert.equal(automatic.selectedRouteId, 'cpu-gpu-video-tail');
  assert.deepEqual(Array.from(automatic.cpuPrefixNodeIds), ['p', 'm']);
  assert.deepEqual(Array.from(automatic.videoSuffixNodeIds), ['s', 'c']);
});
