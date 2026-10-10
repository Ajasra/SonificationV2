import type { FilterModule } from '../descriptor.ts';
import { filter as compressor } from './compressor.ts';
import { filter as noisegate } from './noisegate.ts';
import { filter as envfilter } from './envfilter.ts';
import { filter as ducker } from './ducker.ts';
import { filter as limiter } from './limiter.ts';
import { filter as transient } from './transient.ts';
import { filter as expander } from './expander.ts';
import { filter as multiband } from './multiband.ts';

export const dynamicsFilters: FilterModule[] = [
  compressor,
  noisegate,
  envfilter,
  ducker,
  limiter,
  transient,
  expander,
  multiband,
];
