import type { FilterModule } from '../descriptor.ts';
import { filter as vynil } from './vynil.ts';
import { filter as bitcrusher } from './bitcrusher.ts';
import { filter as tapewow } from './tapewow.ts';
import { filter as srreducer } from './srreducer.ts';
import { filter as dropout } from './dropout.ts';
import { filter as tapesat } from './tapesat.ts';
import { filter as telephone } from './telephone.ts';
import { filter as hiss } from './hiss.ts';

export const lofiFilters: FilterModule[] = [
  vynil,
  bitcrusher,
  tapewow,
  srreducer,
  dropout,
  tapesat,
  telephone,
  hiss,
];
