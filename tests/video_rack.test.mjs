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
  source = source.replace(/import\.meta/g, '({ env: {} })');
  const code = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports,
    console: { warn() {}, error() {}, log() {} },
    performance,
    DOMException,
    setTimeout,
    clearTimeout,
    require: (name) =>
      name.endsWith('.ts')
        ? load(path.resolve(path.dirname(filename), name), globals)
        : nativeRequire(name),
    ...globals,
  }, { filename });
  return exports;
}

const { VIDEO_FILTER_DESCRIPTORS, createVideoFilterInstance } = load('src/engine/video-filters/factory.ts');
const { validatePreset } = load('src/presets/validate-preset.ts');

test('Video Rack: All 14 descriptors are registered with required metadata', () => {
  const ids = Object.keys(VIDEO_FILTER_DESCRIPTORS);
  assert.equal(ids.length, 14, 'Expected 14 video filters registered');

  const expectedIds = [
    'syncglitch',
    'colorizer',
    'solarizer',
    'differentiator',
    'ruttetra',
    'chromasmear',
    'crtbloom',
    'vidicon',
    'procamp',
    'feedback',
    'rftuner',
    'cvislicer',
    'scanimate',
    'framedelay',
  ];

  for (const id of expectedIds) {
    assert.ok(VIDEO_FILTER_DESCRIPTORS[id], `Descriptor for ${id} must exist`);
    const desc = VIDEO_FILTER_DESCRIPTORS[id];
    assert.ok(desc.name, `${id} must have a name`);
    assert.ok(desc.category, `${id} must have a category`);
    assert.ok(desc.description, `${id} must have a description`);
    assert.ok(Array.isArray(desc.params), `${id} params must be an array`);

    for (const p of desc.params) {
      assert.ok(p.name, `${id} param must have name`);
      assert.ok(typeof p.min === 'number', `${id} param min must be number`);
      assert.ok(typeof p.max === 'number', `${id} param max must be number`);
      assert.ok(p.min <= p.max, `${id} param min must be <= max`);
      assert.ok(p.value >= p.min && p.value <= p.max, `${id} default value must be in range`);
    }
  }
});

test('Video Rack: Every filter can instantiate and process a test frame without errors', () => {
  const width = 160;
  const height = 120;
  const numBytes = width * height * 4;

  const filterIds = Object.keys(VIDEO_FILTER_DESCRIPTORS);

  for (const id of filterIds) {
    const filter = createVideoFilterInstance(id);
    assert.ok(filter, `Filter ${id} instance must exist`);
    filter.init(width, height);

    // Create gradient frame
    const frame = new Uint8ClampedArray(numBytes);
    for (let i = 0; i < numBytes; i += 4) {
      frame[i] = (i * 7) % 256;      // R
      frame[i + 1] = (i * 13) % 256;  // G
      frame[i + 2] = (i * 29) % 256;  // B
      frame[i + 3] = 255;             // A
    }

    const ctx = {
      width,
      height,
      timeMs: 1234,
      audioRms: 0.25,
      audioPeak: 0.8,
    };

    filter.processFrame(frame, ctx);

    // Verify all byte values remain valid clamped integers
    for (let i = 0; i < Math.min(1000, numBytes); i++) {
      assert.ok(!Number.isNaN(frame[i]), `Filter ${id} produced NaN at index ${i}`);
      assert.ok(frame[i] >= 0 && frame[i] <= 255, `Filter ${id} byte out of range at ${i}: ${frame[i]}`);
    }
  }
});

test('Video Rack: validatePreset correctly accepts and validates videoFilters array', () => {
  const basePreset = {
    id: 'test_preset',
    name: 'Test Preset',
    description: 'Testing video filters validation',
    reader: {
      rawType: 'PLANAR',
      law: 'A_LAW',
      sign: 'UNSIGNED',
      bits: 8,
      endianess: 'LITTLE_ENDIAN',
      colorSpace: 'RGB',
    },
    writer: {
      rawType: 'PLANAR',
      law: 'A_LAW',
      sign: 'UNSIGNED',
      bits: 8,
      endianess: 'LITTLE_ENDIAN',
      colorSpace: 'RGB',
    },
    equalize: false,
    blendMode: 'NONE',
    blendAmount: 0,
    filters: [],
    videoFilters: [
      {
        id: 'vf_sync',
        type: 'syncglitch',
        enabled: true,
        params: { hSkew: 20, vRoll: 0, jitter: 5, headSwitch: 12 },
      },
      {
        id: 'vf_crt',
        type: 'crtbloom',
        enabled: true,
        params: { bloom: 1.2, grille: 0.4, scanlines: 0.5, threshold: 120 },
      },
    ],
  };

  const validated = validatePreset(basePreset);
  assert.equal(validated.videoFilters?.length, 2);
  assert.equal(validated.videoFilters[0].type, 'syncglitch');
  assert.equal(validated.videoFilters[1].type, 'crtbloom');
});

test('Video Rack: validatePreset defaults videoFilters to empty array when omitted', () => {
  const legacyPreset = {
    id: 'legacy_preset',
    name: 'Legacy Preset',
    reader: {
      rawType: 'PLANAR',
      law: 'NONE',
      sign: 'UNSIGNED',
      bits: 8,
      endianess: 'LITTLE_ENDIAN',
      colorSpace: 'RGB',
    },
    writer: {
      rawType: 'PLANAR',
      law: 'NONE',
      sign: 'UNSIGNED',
      bits: 8,
      endianess: 'LITTLE_ENDIAN',
      colorSpace: 'RGB',
    },
    equalize: true,
    blendMode: 'NONE',
    blendAmount: 0,
    filters: [],
  };

  const validated = validatePreset(legacyPreset);
  assert.ok(Array.isArray(validated.videoFilters), 'videoFilters should be an array');
  assert.equal(validated.videoFilters.length, 0);
});
