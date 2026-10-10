import type { FilterModule } from '../descriptor.ts';
import { filter as comb } from './comb.ts';
import { filter as echo } from './echo.ts';
import { filter as canyondelay } from './canyondelay.ts';
import { filter as reverb } from './reverb.ts';

export const delayFilters: FilterModule[] = [
  comb,
  echo,
  canyondelay,
  reverb,
];
