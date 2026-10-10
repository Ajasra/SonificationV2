import type { FilterParam, VideoFilterCategory, VideoFilterId } from '../../types/index.ts';
import type { IVideoFilter } from './base.ts';

export interface VideoFilterDescriptor {
  id: VideoFilterId;
  name: string;
  category: VideoFilterCategory;
  description: string;
  params: FilterParam[];
}

export interface VideoFilterModule {
  descriptor: VideoFilterDescriptor;
  create: () => IVideoFilter;
}
