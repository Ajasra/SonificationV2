// Types and configuration for Sonopticon

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
  | 'tremolo'
  | 'tapewow'
  | 'srreducer'
  | 'dropout'
  | 'fmop'
  | 'drone'
  | 'pitchshift'
  | 'envfilter'
  | 'ducker'
  | 'limiter'
  | 'tapesat'
  | 'telephone'
  | 'hiss'
  | 'suboct'
  | 'resbank'
  | 'granular'
  | 'vocoder'
  | 'shrandom'
  | 'transient'
  | 'expander'
  | 'multiband';

export interface FilterNodeConfig {
  id: string; // unique instance id
  type: FilterId;
  enabled: boolean;
  sampleRate: number;
  params: Record<string, number>;
}

export type VideoFilterCategory = 'raster' | 'color' | 'sync' | 'tape' | 'optic';

export type VideoFilterId =
  | 'syncglitch'
  | 'colorizer'
  | 'solarizer'
  | 'differentiator'
  | 'ruttetra'
  | 'chromasmear'
  | 'crtbloom'
  | 'vidicon'
  | 'procamp'
  | 'feedback'
  | 'rftuner'
  | 'cvislicer'
  | 'scanimate'
  | 'framedelay';

export interface VideoFilterNodeConfig {
  id: string; // unique instance id
  type: VideoFilterId;
  enabled: boolean;
  params: Record<string, number>;
}

export interface VideoFrameContext {
  width: number;
  height: number;
  timeMs: number;
  audioRms?: number;
  audioPeak?: number;
}

export interface ChainNodeRef {
  kind: 'audio' | 'video';
  id: string;
}

export interface SonopticonPreset {
  id: string;
  name: string;
  description?: string;
  reader: StreamConfig;
  writer: StreamConfig;
  equalize: boolean;
  blendMode: BlendMode;
  blendAmount: number; // 0 to 1
  filters: FilterNodeConfig[];
  videoFilters?: VideoFilterNodeConfig[];
  /** Interleaved execution order of `filters` and `videoFilters`; absent = audio then video. */
  chain?: ChainNodeRef[];
}

export type SonificationPreset = SonopticonPreset;

export type InputSourceMode = 'image' | 'camera' | 'video_file';
