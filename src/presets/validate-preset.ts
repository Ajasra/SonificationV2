import { FILTER_DESCRIPTORS } from '../engine/filters/factory.ts';
import type { SonificationPreset } from '../types/index.ts';

const COLOR_SPACES = new Set(['RGB', 'OHTA', 'CMY', 'XYZ', 'YXY', 'HCL', 'LUV', 'LAB']);
const RAW_TYPES = new Set(['PLANAR', 'INTERLEAVED']);
const LAWS = new Set(['NONE', 'A_LAW', 'U_LAW']);
const SIGNS = new Set(['SIGNED', 'UNSIGNED']);
const ENDIANNESS = new Set(['LITTLE_ENDIAN', 'BIG_ENDIAN']);
const BLENDS = new Set(['NONE', 'OVERLAY', 'SCREEN', 'MULTIPLY', 'DIFFERENCE', 'ADD', 'EXCLUSION']);

export function validatePreset(value: unknown): SonificationPreset {
  const fail = (message: string): never => { throw new Error(`Invalid preset: ${message}`); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('expected an object');
  const preset = value as Record<string, unknown>;
  if (JSON.stringify(preset).length > 256 * 1024) fail('preset exceeds 256 KB');
  const stringField = (field: unknown, name: string, max: number) => {
    if (typeof field !== 'string' || !field.trim() || field.length > max) fail(`${name} is invalid`);
    return (field as string).trim();
  };
  stringField(preset.id, 'id', 128);
  stringField(preset.name, 'name', 128);
  if (preset.description !== undefined && (typeof preset.description !== 'string' || preset.description.length > 4096)) fail('description is invalid');
  if (typeof preset.equalize !== 'boolean') fail('equalize is invalid');
  if (!BLENDS.has(String(preset.blendMode))) fail('blendMode is invalid');
  if (typeof preset.blendAmount !== 'number' || !Number.isFinite(preset.blendAmount) || preset.blendAmount < 0 || preset.blendAmount > 1) fail('blendAmount is invalid');
  for (const configName of ['reader', 'writer'] as const) {
    const config = preset[configName];
    if (!config || typeof config !== 'object' || Array.isArray(config)) fail(`${configName} is invalid`);
    const c = config as Record<string, unknown>;
    if (!RAW_TYPES.has(String(c.rawType)) || !LAWS.has(String(c.law)) || !SIGNS.has(String(c.sign)) || !ENDIANNESS.has(String(c.endianess)) || !COLOR_SPACES.has(String(c.colorSpace))) fail(`${configName} contains an unsupported format`);
    if (![8, 16, 24].includes(Number(c.bits))) fail(`${configName}.bits is invalid`);
  }
  if (!Array.isArray(preset.filters) || preset.filters.length > 64) fail('filter list is invalid');
  const ids = new Set<string>();
  for (const raw of preset.filters as unknown[]) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('filter entry is invalid');
    const filter = raw as Record<string, unknown>;
    const id = stringField(filter.id, 'filter id', 128);
    if (ids.has(id)) fail('filter ids must be unique');
    ids.add(id);
    if (typeof filter.enabled !== 'boolean') fail(`filter ${id} enabled flag is invalid`);
    if (typeof filter.sampleRate !== 'number' || !Number.isFinite(filter.sampleRate) || filter.sampleRate < 8000 || filter.sampleRate > 96000) fail(`filter ${id} sample rate is invalid`);
    const descriptor = FILTER_DESCRIPTORS[String(filter.type) as keyof typeof FILTER_DESCRIPTORS];
    if (!descriptor) fail(`filter ${id} type is unknown`);
    if (!filter.params || typeof filter.params !== 'object' || Array.isArray(filter.params)) fail(`filter ${id} params are invalid`);
    const params = filter.params as Record<string, unknown>;
    const allowed = new Set(descriptor.params.map(p => p.name));
    for (const [name, param] of Object.entries(params)) {
      const desc = descriptor.params.find(p => p.name === name);
      if (!desc) fail(`filter ${id} has unknown parameter ${name}`);
      const range = desc!;
      if (typeof param !== 'number' || !Number.isFinite(param) || param < range.min || param > range.max) fail(`filter ${id} parameter ${name} is out of range`);
    }
    for (const name of allowed) if (params[name] === undefined) fail(`filter ${id} is missing parameter ${name}`);
  }
  return JSON.parse(JSON.stringify(preset)) as SonificationPreset;
}
