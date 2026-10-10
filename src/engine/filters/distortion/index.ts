import type { FilterModule } from '../descriptor.ts';
import { filter as vacuum } from './vacuum.ts';
import { filter as sigmoid } from './sigmoid.ts';
import { filter as divider } from './divider.ts';
import { filter as shiftr } from './shiftr.ts';
import { filter as randmix } from './randmix.ts';
import { filter as amplify } from './amplify.ts';
import { filter as wavefolder } from './wavefolder.ts';

export const distortionFilters: FilterModule[] = [
  vacuum,
  sigmoid,
  divider,
  shiftr,
  randmix,
  amplify,
  wavefolder,
];
