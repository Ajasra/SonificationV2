import type { FilterId } from '../../types/index.ts';
import type { IDspFilter } from './base.ts';
import type { FilterDescriptor, FilterModule } from './descriptor.ts';
import { eqFilters } from './eq/index.ts';
import { delayFilters } from './delay/index.ts';
import { modulationFilters } from './modulation/index.ts';
import { synthFilters } from './synth/index.ts';
import { distortionFilters } from './distortion/index.ts';
import { dynamicsFilters } from './dynamics/index.ts';
import { lofiFilters } from './lofi/index.ts';

export type { FilterDescriptor } from './descriptor.ts';

// Each category folder owns its filters (one file per filter, exporting `filter`).
// To add a filter: create <category>/<id>.ts, register it in that folder's index.ts,
// and add its id to the FilterId union in types/index.ts.
const ALL_MODULES: FilterModule[] = [
  ...eqFilters,
  ...delayFilters,
  ...modulationFilters,
  ...synthFilters,
  ...distortionFilters,
  ...dynamicsFilters,
  ...lofiFilters,
];

export const FILTER_DESCRIPTORS = Object.fromEntries(
  ALL_MODULES.map((m) => [m.descriptor.id, m.descriptor]),
) as Record<FilterId, FilterDescriptor>;

const CREATORS = new Map<string, FilterModule['create']>(
  ALL_MODULES.map((m) => [m.descriptor.id, m.create]),
);

export function createFilterInstance(type: FilterId, sampleRate: number = 44100): IDspFilter {
  const create = CREATORS.get(type) ?? CREATORS.get('amplify')!;
  return create(sampleRate);
}
