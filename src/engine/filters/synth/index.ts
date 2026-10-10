import type { FilterModule } from '../descriptor.ts';
import { filter as vcf303 } from './vcf303.ts';
import { filter as plucked } from './plucked.ts';
import { filter as fmop } from './fmop.ts';
import { filter as drone } from './drone.ts';
import { filter as pitchshift } from './pitchshift.ts';
import { filter as suboct } from './suboct.ts';
import { filter as resbank } from './resbank.ts';
import { filter as granular } from './granular.ts';
import { filter as vocoder } from './vocoder.ts';
import { filter as shrandom } from './shrandom.ts';

export const synthFilters: FilterModule[] = [
  vcf303,
  plucked,
  fmop,
  drone,
  pitchshift,
  suboct,
  resbank,
  granular,
  vocoder,
  shrandom,
];
