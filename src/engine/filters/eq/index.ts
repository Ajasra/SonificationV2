import type { FilterModule } from '../descriptor.ts';
import { filter as djeq } from './djeq.ts';
import { filter as basstreble } from './basstreble.ts';
import { filter as reson } from './reson.ts';
import { filter as moogladder } from './moogladder.ts';
import { filter as svf } from './svf.ts';
import { filter as formant } from './formant.ts';

export const eqFilters: FilterModule[] = [
  djeq,
  basstreble,
  reson,
  moogladder,
  svf,
  formant,
];
