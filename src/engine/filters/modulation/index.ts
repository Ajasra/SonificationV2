import type { FilterModule } from '../descriptor.ts';
import { filter as phaser } from './phaser.ts';
import { filter as wahwah } from './wahwah.ts';
import { filter as lfophaser } from './lfophaser.ts';
import { filter as fourbyfour } from './fourbyfour.ts';
import { filter as autophaser } from './autophaser.ts';
import { filter as autopan } from './autopan.ts';
import { filter as ringmod } from './ringmod.ts';
import { filter as flanger } from './flanger.ts';
import { filter as tremolo } from './tremolo.ts';

export const modulationFilters: FilterModule[] = [
  phaser,
  wahwah,
  lfophaser,
  fourbyfour,
  autophaser,
  autopan,
  ringmod,
  flanger,
  tremolo,
];
