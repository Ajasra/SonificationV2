import type { VideoFilterId } from '../../types/index.ts';
import type { IVideoFilter } from './base.ts';
import type { VideoFilterDescriptor, VideoFilterModule } from './descriptor.ts';
import { syncFilters } from './sync/index.ts';
import { colorFilters } from './color/index.ts';
import { rasterFilters } from './raster/index.ts';
import { tapeFilters } from './tape/index.ts';
import { opticFilters } from './optic/index.ts';

export type { VideoFilterDescriptor } from './descriptor.ts';

const ALL_VIDEO_MODULES: VideoFilterModule[] = [
  ...syncFilters,
  ...colorFilters,
  ...rasterFilters,
  ...tapeFilters,
  ...opticFilters,
];

export const VIDEO_FILTER_DESCRIPTORS = Object.fromEntries(
  ALL_VIDEO_MODULES.map((m) => [m.descriptor.id, m.descriptor]),
) as Record<VideoFilterId, VideoFilterDescriptor>;

const CREATORS = new Map<string, VideoFilterModule['create']>(
  ALL_VIDEO_MODULES.map((m) => [m.descriptor.id, m.create]),
);

export function createVideoFilterInstance(type: VideoFilterId): IVideoFilter {
  const create = CREATORS.get(type) ?? CREATORS.get('syncglitch')!;
  return create();
}
