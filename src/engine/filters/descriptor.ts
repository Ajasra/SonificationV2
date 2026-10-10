import type { FilterCategory, FilterId, FilterParam } from '../../types/index.ts';
import type { IDspFilter } from './base.ts';

export interface FilterDescriptor {
  id: FilterId;
  name: string;
  category: FilterCategory;
  description: string;
  defaultSampleRate: number;
  params: FilterParam[];
}

// One filter = one file exporting `filter`: its UI descriptor plus an instance constructor.
export interface FilterModule {
  descriptor: FilterDescriptor;
  create: (sampleRate: number) => IDspFilter;
}
