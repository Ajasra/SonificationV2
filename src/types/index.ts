// Types and configuration for Sonification V2

export type ColorSpace = 'RGB' | 'OHTA' | 'CMY' | 'XYZ' | 'YXY' | 'HCL' | 'LUV' | 'LAB';
export type RawType = 'PLANAR' | 'INTERLEAVED';
export type CompandingLaw = 'NONE' | 'A_LAW' | 'U_LAW';
export type BitDepth = 8 | 16 | 24;
export type Endianness = 'LITTLE_ENDIAN' | 'BIG_ENDIAN';
export type Sign = 'SIGNED' | 'UNSIGNED';

export type BlendMode = 'NONE' | 'OVERLAY' | 'SCREEN' | 'MULTIPLY' | 'DIFFERENCE' | 'ADD' | 'EXCLUSION';

export interface StreamConfig {
  rawType: RawType;
  law: CompandingLaw;
  sign: Sign;
  bits: BitDepth;
  endianess: Endianness;
  colorSpace: ColorSpace;
}

export interface FilterParam {
  name: string;
  label: string;
  type: 'float' | 'int' | 'bool';
  min: number;
  max: number;
  step: number;
  value: number;
  tooltip?: string;
}

export type FilterCategory = 'eq' | 'delay' | 'modulation' | 'synth' | 'distortion' | 'dynamics' | 'lofi';

export type FilterId =
  | 'djeq'
  | 'comb'
  | 'vynil'
  | 'canyondelay'
  | 'vcf303'
  | 'echo'
  | 'phaser'
  | 'wahwah'
  | 'basstreble'
  | 'shiftr'
  | 'sigmoid'
  | 'autopan'
  | 'randmix'
  | 'divider'
  | 'lfophaser'
  | 'fourbyfour'
  | 'autophaser'
  | 'amplify'
  | 'reverb'
  | 'vacuum'
  | 'reson'
  | 'plucked'
  | 'compressor'
  | 'noisegate'
  | 'bitcrusher'
  | 'ringmod'
  | 'moogladder'
  | 'svf'
  | 'formant'
  | 'flanger'
  | 'wavefolder'
  | 'tremolo';

export interface FilterNodeConfig {
  id: string; // unique instance id
  type: FilterId;
  enabled: boolean;
  sampleRate: number;
  params: Record<string, number>;
}

export interface SonificationPreset {
  id: string;
  name: string;
  description?: string;
  reader: StreamConfig;
  writer: StreamConfig;
  equalize: boolean;
  blendMode: BlendMode;
  blendAmount: number; // 0 to 1
  filters: FilterNodeConfig[];
}

export type InputSourceMode = 'image' | 'camera' | 'video_file';
