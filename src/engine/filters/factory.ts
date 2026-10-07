import type { FilterCategory, FilterId, FilterParam } from '../../types/index.ts';
import type { IDspFilter } from './base.ts';
import { DjEqFilter, AuBassTrebleFilter, ResonFilter } from './eq.ts';
import { CombFilter, AuEchoFilter, CanyonDelayFilter, TReverbFilter } from './delay.ts';
import {
  AuPhaserFilter,
  AuWahwahFilter,
  LFOPhaserFilter,
  FourByFourPoleFilter,
  AutoPhaserFilter,
  TapAutopanFilter,
} from './phase.ts';
import { Vcf303Filter, PluckedStringFilter } from './synth.ts';
import {
  VynilFilter,
  VacuumTubeAmpFilter,
  TapSigmoidFilter,
  DividerFilter,
  TShiftRFilter,
  RandmixFilter,
  AuAmplifyFilter,
} from './dist.ts';
import { CompressorFilter, NoiseGateFilter } from './dynamics.ts';
import { MoogLadderFilter, SvfFilter, FormantFilter } from './spectral.ts';
import { BitcrusherFilter, WavefolderFilter } from './lofi.ts';
import { RingModFilter, FlangerFilter, TremoloFilter } from './modulation.ts';

export interface FilterDescriptor {
  id: FilterId;
  name: string;
  category: FilterCategory;
  description: string;
  defaultSampleRate: number;
  params: FilterParam[];
}

export const FILTER_DESCRIPTORS: Record<FilterId, FilterDescriptor> = {
  djeq: {
    id: 'djeq',
    name: 'DJ 3-Band EQ',
    category: 'eq',
    description: '3-band equalizer with low shelf, mid peak, and high shelf.',
    defaultSampleRate: 44100,
    params: [
      { name: 'lo', label: 'Bass (dB)', type: 'float', min: -70, max: 20, step: 0.5, value: -10 },
      { name: 'mid', label: 'Mid (dB)', type: 'float', min: -70, max: 20, step: 0.5, value: 1 },
      { name: 'hi', label: 'Treble (dB)', type: 'float', min: -70, max: 20, step: 0.5, value: -10 },
      { name: 'peakBw', label: 'Peak Bandwidth', type: 'float', min: 0.1, max: 2, step: 0.05, value: 0.3 },
      { name: 'shelfSlope', label: 'Shelf Slope', type: 'float', min: 0.1, max: 3, step: 0.1, value: 1.5 },
    ],
  },
  basstreble: {
    id: 'basstreble',
    name: 'Bass & Treble',
    category: 'eq',
    description: 'Audacity shelving tone control.',
    defaultSampleRate: 44100,
    params: [
      { name: 'dBBass', label: 'Bass (dB)', type: 'float', min: -30, max: 30, step: 0.5, value: 0 },
      { name: 'dBTreble', label: 'Treble (dB)', type: 'float', min: -30, max: 30, step: 0.5, value: 0 },
      { name: 'hzBass', label: 'Bass Cutoff (Hz)', type: 'float', min: 50, max: 500, step: 10, value: 250 },
      { name: 'hzTreble', label: 'Treble Cutoff (Hz)', type: 'float', min: 1000, max: 8000, step: 50, value: 4000 },
    ],
  },
  reson: {
    id: 'reson',
    name: 'Reson Filter',
    category: 'eq',
    description: 'Two-pole resonant bandpass filter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freqControl', label: 'Frequency (Hz)', type: 'float', min: 20, max: 10000, step: 10, value: 500 },
      { name: 'bwControl', label: 'Bandwidth (Hz)', type: 'float', min: 50, max: 2000, step: 10, value: 1000 },
    ],
  },
  comb: {
    id: 'comb',
    name: 'Comb Filter',
    category: 'delay',
    description: 'Feedback comb filter with cubic Hermite interpolation.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Frequency (Hz)', type: 'float', min: 10, max: 1000, step: 1, value: 100 },
      { name: 'feedback', label: 'Feedback', type: 'float', min: -0.99, max: 0.99, step: 0.01, value: 0.1 },
    ],
  },
  echo: {
    id: 'echo',
    name: 'Echo Delay',
    category: 'delay',
    description: 'Audacity audio echo with decay feedback.',
    defaultSampleRate: 44100,
    params: [
      { name: 'delay', label: 'Delay Time (s)', type: 'float', min: 0.001, max: 1.0, step: 0.001, value: 0.5 },
      { name: 'decay', label: 'Decay Factor', type: 'float', min: 0.0, max: 0.99, step: 0.01, value: 0.5 },
    ],
  },
  canyondelay: {
    id: 'canyondelay',
    name: 'Canyon Delay',
    category: 'delay',
    description: 'Stereo cross-feedback echo with lowpass damping.',
    defaultSampleRate: 44100,
    params: [
      { name: 'ltrTime', label: 'Left Time (s)', type: 'float', min: 0.001, max: 1.0, step: 0.005, value: 0.5 },
      { name: 'rtlTime', label: 'Right Time (s)', type: 'float', min: 0.001, max: 1.0, step: 0.005, value: 0.5 },
      { name: 'ltrFeedback', label: 'Left Feedback', type: 'float', min: -0.95, max: 0.95, step: 0.01, value: 0.1 },
      { name: 'rtlFeedback', label: 'Right Feedback', type: 'float', min: -0.95, max: 0.95, step: 0.01, value: -0.1 },
      { name: 'cutoff', label: 'Cutoff (Hz)', type: 'float', min: 100, max: 15000, step: 50, value: 1000 },
    ],
  },
  reverb: {
    id: 'reverb',
    name: 'TReverb',
    category: 'delay',
    description: 'Long delay reverberation chamber.',
    defaultSampleRate: 44100,
    params: [
      { name: 'delayMs', label: 'Delay (ms)', type: 'float', min: 10, max: 8000, step: 10, value: 2000 },
      { name: 'decay', label: 'Decay', type: 'float', min: 0.05, max: 0.95, step: 0.01, value: 0.5 },
    ],
  },
  phaser: {
    id: 'phaser',
    name: 'Audacity Phaser',
    category: 'modulation',
    description: 'Multi-stage allpass phaser with exponential LFO.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'LFO Freq (Hz)', type: 'float', min: 0.01, max: 30, step: 0.05, value: 0.4 },
      { name: 'stages', label: 'Stages', type: 'int', min: 1, max: 24, step: 1, value: 2 },
      { name: 'dryWet', label: 'Dry/Wet', type: 'int', min: 0, max: 255, step: 1, value: 128 },
      { name: 'depth', label: 'Depth', type: 'int', min: 0, max: 255, step: 1, value: 100 },
      { name: 'feedback', label: 'Feedback', type: 'float', min: -95, max: 95, step: 1, value: 0 },
    ],
  },
  wahwah: {
    id: 'wahwah',
    name: 'Wahwah',
    category: 'modulation',
    description: 'Swept resonance bandpass filter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'LFO Freq (Hz)', type: 'float', min: 0.1, max: 30, step: 0.1, value: 15 },
      { name: 'depth', label: 'Depth (%)', type: 'float', min: 0, max: 100, step: 1, value: 70 },
      { name: 'resonance', label: 'Resonance', type: 'float', min: 0.5, max: 50, step: 0.5, value: 25 },
      { name: 'freqOfs', label: 'Freq Offset', type: 'float', min: 0, max: 100, step: 1, value: 30 },
    ],
  },
  lfophaser: {
    id: 'lfophaser',
    name: 'LFO Phaser',
    category: 'modulation',
    description: 'SWH 6-stage allpass phaser.',
    defaultSampleRate: 44100,
    params: [
      { name: 'lfoRate', label: 'LFO Rate', type: 'float', min: 0.001, max: 50, step: 0.01, value: 0.001 },
      { name: 'lfoDepth', label: 'Depth', type: 'float', min: 0, max: 1, step: 0.01, value: 0.5 },
      { name: 'fb', label: 'Feedback', type: 'float', min: -0.99, max: 0.99, step: 0.01, value: 0 },
      { name: 'spread', label: 'Spread', type: 'float', min: 0.1, max: 3, step: 0.1, value: 1 },
    ],
  },
  fourbyfour: {
    id: 'fourbyfour',
    name: '4x4 Pole Filter Bank',
    category: 'modulation',
    description: '16 allpass stages grouped into 4 poles.',
    defaultSampleRate: 44100,
    params: [
      { name: 'f0', label: 'Freq 0 (Hz)', type: 'float', min: 10, max: 20000, step: 100, value: 10 },
      { name: 'f1', label: 'Freq 1 (Hz)', type: 'float', min: 10, max: 20000, step: 100, value: 10000 },
      { name: 'f2', label: 'Freq 2 (Hz)', type: 'float', min: 10, max: 20000, step: 100, value: 15000 },
      { name: 'f3', label: 'Freq 3 (Hz)', type: 'float', min: 10, max: 20000, step: 100, value: 20000 },
      { name: 'fb0', label: 'Feedback 0', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0 },
      { name: 'fb1', label: 'Feedback 1', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0 },
      { name: 'fb2', label: 'Feedback 2', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0 },
      { name: 'fb3', label: 'Feedback 3', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0 },
    ],
  },
  autophaser: {
    id: 'autophaser',
    name: 'Auto Phaser',
    category: 'modulation',
    description: 'Dynamic phaser controlled by an envelope follower.',
    defaultSampleRate: 44100,
    params: [
      { name: 'attackP', label: 'Attack', type: 'float', min: 0.01, max: 1, step: 0.01, value: 0.1 },
      { name: 'decayP', label: 'Decay', type: 'float', min: 0.01, max: 1, step: 0.01, value: 0.1 },
      { name: 'depthP', label: 'Depth', type: 'float', min: 0.01, max: 1, step: 0.01, value: 0.1 },
      { name: 'fb', label: 'Feedback', type: 'float', min: -0.95, max: 0.95, step: 0.01, value: 0 },
    ],
  },
  autopan: {
    id: 'autopan',
    name: 'Auto Pan',
    category: 'modulation',
    description: 'Stereo panning LFO modulation.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Rate (Hz)', type: 'float', min: 0.1, max: 20, step: 0.1, value: 5 },
      { name: 'depth', label: 'Depth (%)', type: 'float', min: 0, max: 100, step: 1, value: 10 },
      { name: 'gain', label: 'Gain (dB)', type: 'float', min: -20, max: 20, step: 0.5, value: 1 },
    ],
  },
  vcf303: {
    id: 'vcf303',
    name: 'Roland TB-303 VCF',
    category: 'synth',
    description: 'Diode ladder voltage-controlled resonant acid filter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'cutoff', label: 'Cutoff', type: 'float', min: 0.05, max: 1, step: 0.01, value: 0.5 },
      { name: 'resonance', label: 'Resonance', type: 'float', min: 0.1, max: 1, step: 0.01, value: 1 },
      { name: 'envMod', label: 'Env Mod', type: 'float', min: 0, max: 1, step: 0.01, value: 0.5 },
      { name: 'decay', label: 'Decay', type: 'float', min: 0.1, max: 2, step: 0.05, value: 1 },
    ],
  },
  plucked: {
    id: 'plucked',
    name: 'Plucked String',
    category: 'synth',
    description: 'Karplus-Strong physical string synthesis model.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Freq (Hz)', type: 'float', min: 40, max: 8000, step: 10, value: 1000 },
      { name: 'sharp', label: 'Sharpness', type: 'float', min: 0.1, max: 0.99, step: 0.01, value: 0.5 },
    ],
  },
  vynil: {
    id: 'vynil',
    name: 'Vinyl Record Dust',
    category: 'distortion',
    description: 'Mechanical turntable warp, surface wear, and clicks.',
    defaultSampleRate: 44100,
    params: [
      { name: 'year', label: 'Release Year', type: 'float', min: 1900, max: 1990, step: 1, value: 1987 },
      { name: 'rpm', label: 'RPM', type: 'float', min: 33, max: 78, step: 1, value: 63 },
      { name: 'warp', label: 'Motor Warp', type: 'float', min: 0, max: 0.4, step: 0.01, value: 0.45 },
      { name: 'click', label: 'Click Rate', type: 'float', min: 0, max: 1, step: 0.01, value: 0.235 },
      { name: 'wear', label: 'Groove Wear', type: 'float', min: 0, max: 1, step: 0.01, value: 0 },
    ],
  },
  vacuum: {
    id: 'vacuum',
    name: 'Vacuum Tube Amp',
    category: 'distortion',
    description: 'Analog vacuum tube saturation curve.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rangeA', label: 'Negative Knee', type: 'float', min: -0.99, max: -0.1, step: 0.01, value: -0.5 },
      { name: 'rangeB', label: 'Positive Knee', type: 'float', min: 0.1, max: 0.99, step: 0.01, value: 0.5 },
    ],
  },
  sigmoid: {
    id: 'sigmoid',
    name: 'Sigmoid Overdrive',
    category: 'distortion',
    description: 'Soft sigmoid overdrive saturation.',
    defaultSampleRate: 44100,
    params: [
      { name: 'fact', label: 'Factor', type: 'float', min: -10, max: -1, step: 0.1, value: -5 },
    ],
  },
  divider: {
    id: 'divider',
    name: 'Subharmonic Divider',
    category: 'distortion',
    description: 'Zero-crossing pitch flip-flop frequency divider.',
    defaultSampleRate: 44100,
    params: [
      { name: 'denominator', label: 'Divider Ratio', type: 'int', min: 1, max: 32, step: 1, value: 2 },
    ],
  },
  shiftr: {
    id: 'shiftr',
    name: 'TShiftR Fold',
    category: 'distortion',
    description: 'Square root feedback fold distortion.',
    defaultSampleRate: 44100,
    params: [
      { name: 'mPasses', label: 'Passes', type: 'int', min: 1, max: 10, step: 1, value: 5 },
      { name: 'mDiv', label: 'Divisor', type: 'float', min: 0.5, max: 5, step: 0.1, value: 1 },
    ],
  },
  randmix: {
    id: 'randmix',
    name: 'Randmix FIR',
    category: 'distortion',
    description: 'Randomized impulse response history filter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'tail', label: 'Tail Length', type: 'int', min: 2, max: 40, step: 1, value: 10 },
    ],
  },
  amplify: {
    id: 'amplify',
    name: 'Amplify',
    category: 'distortion',
    description: 'Linear gain multiplier.',
    defaultSampleRate: 44100,
    params: [
      { name: 'amp', label: 'Gain Multiplier', type: 'float', min: 0.1, max: 10, step: 0.1, value: 1.0 },
    ],
  },
  compressor: {
    id: 'compressor',
    name: 'Studio Compressor',
    category: 'dynamics',
    description: 'Dynamic range compressor and peak limiter with auto-exposure tone mapping.',
    defaultSampleRate: 44100,
    params: [
      { name: 'threshold', label: 'Thresh (dB)', type: 'float', min: -60, max: 0, step: 1, value: -18 },
      { name: 'ratio', label: 'Ratio (:1)', type: 'float', min: 1, max: 20, step: 0.5, value: 4 },
      { name: 'attack', label: 'Attack (ms)', type: 'float', min: 0.1, max: 100, step: 0.5, value: 10 },
      { name: 'release', label: 'Release (ms)', type: 'float', min: 10, max: 1000, step: 10, value: 100 },
      { name: 'makeupGain', label: 'Gain (dB)', type: 'float', min: 0, max: 24, step: 0.5, value: 3 },
    ],
  },
  noisegate: {
    id: 'noisegate',
    name: 'Noise Gate',
    category: 'dynamics',
    description: 'Downward noise gate squelch for high-contrast shadow isolation.',
    defaultSampleRate: 44100,
    params: [
      { name: 'threshold', label: 'Thresh (dB)', type: 'float', min: -80, max: 0, step: 1, value: -36 },
      { name: 'range', label: 'Range (dB)', type: 'float', min: -80, max: 0, step: 1, value: -40 },
      { name: 'attack', label: 'Attack (ms)', type: 'float', min: 0.1, max: 50, step: 0.5, value: 5 },
      { name: 'release', label: 'Release (ms)', type: 'float', min: 10, max: 500, step: 10, value: 100 },
    ],
  },
  bitcrusher: {
    id: 'bitcrusher',
    name: 'Bitcrusher & Decimator',
    category: 'lofi',
    description: 'Bit-depth quantization and sample-rate decimation for chiptune crunch.',
    defaultSampleRate: 44100,
    params: [
      { name: 'bits', label: 'Bit Depth', type: 'int', min: 1, max: 16, step: 1, value: 6 },
      { name: 'downsample', label: 'Decimate', type: 'int', min: 1, max: 64, step: 1, value: 8 },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 1 },
    ],
  },
  ringmod: {
    id: 'ringmod',
    name: 'Ring Modulator',
    category: 'modulation',
    description: 'Carrier multiplication creating metallic sidebands and moiré interference.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Freq (Hz)', type: 'float', min: 10, max: 4000, step: 10, value: 440 },
      { name: 'waveform', label: 'Waveform', type: 'int', min: 0, max: 2, step: 1, value: 0 },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 0.85 },
    ],
  },
  moogladder: {
    id: 'moogladder',
    name: 'Moog 24dB Ladder',
    category: 'eq',
    description: '4-pole resonant transistor ladder filter with nonlinear tanh feedback.',
    defaultSampleRate: 44100,
    params: [
      { name: 'cutoff', label: 'Cutoff (Hz)', type: 'float', min: 20, max: 18000, step: 50, value: 1200 },
      { name: 'resonance', label: 'Resonance', type: 'float', min: 0, max: 4, step: 0.1, value: 2.2 },
      { name: 'drive', label: 'Drive', type: 'float', min: 1, max: 5, step: 0.1, value: 1.5 },
    ],
  },
  svf: {
    id: 'svf',
    name: 'State Variable Filter',
    category: 'eq',
    description: 'Multi-mode 12dB/oct filter morphing from Lowpass to Bandpass, Highpass & Notch.',
    defaultSampleRate: 44100,
    params: [
      { name: 'cutoff', label: 'Cutoff (Hz)', type: 'float', min: 20, max: 18000, step: 50, value: 1500 },
      { name: 'res', label: 'Q Res', type: 'float', min: 0.5, max: 10, step: 0.25, value: 2.0 },
      { name: 'mode', label: 'Mode (LP-BP-HP-N)', type: 'float', min: 0, max: 3, step: 0.1, value: 0.0 },
    ],
  },
  formant: {
    id: 'formant',
    name: 'Formant Resonator',
    category: 'eq',
    description: 'Vocal tract acoustic resonator morphing across /A/, /E/, /I/, /O/, /U/.',
    defaultSampleRate: 44100,
    params: [
      { name: 'vowel', label: 'Vowel (A-E-I-O-U)', type: 'float', min: 0, max: 4, step: 0.1, value: 0.0 },
      { name: 'resonance', label: 'Formant Q', type: 'float', min: 1, max: 20, step: 0.5, value: 8.0 },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 0.9 },
    ],
  },
  flanger: {
    id: 'flanger',
    name: 'Flanger & Chorus',
    category: 'modulation',
    description: 'Modulated delay line with feedback for jet-plane sweeps and lush chorus.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rate', label: 'Rate (Hz)', type: 'float', min: 0.05, max: 10, step: 0.05, value: 0.4 },
      { name: 'depth', label: 'Depth (ms)', type: 'float', min: 0.5, max: 10, step: 0.25, value: 3.0 },
      { name: 'feedback', label: 'Feedback', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0.6 },
      { name: 'delayMs', label: 'Delay (ms)', type: 'float', min: 0.5, max: 20, step: 0.5, value: 2.0 },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 0.5 },
    ],
  },
  wavefolder: {
    id: 'wavefolder',
    name: 'Buchla Wavefolder',
    category: 'distortion',
    description: 'West-Coast nonlinear wavefolder creating harmonic brilliance and psychedelic color folds.',
    defaultSampleRate: 44100,
    params: [
      { name: 'drive', label: 'Drive', type: 'float', min: 1, max: 10, step: 0.2, value: 2.5 },
      { name: 'folds', label: 'Folds', type: 'int', min: 1, max: 6, step: 1, value: 3 },
      { name: 'symmetry', label: 'Symmetry', type: 'float', min: -1, max: 1, step: 0.05, value: 0.0 },
    ],
  },
  tremolo: {
    id: 'tremolo',
    name: 'Tremolo & Strobe',
    category: 'modulation',
    description: 'LFO amplitude modulation producing rhythmic pulses and zebra strobe bands.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rate', label: 'Rate (Hz)', type: 'float', min: 0.5, max: 25, step: 0.25, value: 4.0 },
      { name: 'depth', label: 'Depth', type: 'float', min: 0, max: 1, step: 0.05, value: 0.7 },
      { name: 'shape', label: 'Waveform', type: 'int', min: 0, max: 2, step: 1, value: 0 },
    ],
  },
};

export function createFilterInstance(type: FilterId, sampleRate: number = 44100): IDspFilter {
  switch (type) {
    case 'djeq': return new DjEqFilter(sampleRate);
    case 'basstreble': return new AuBassTrebleFilter(sampleRate);
    case 'reson': return new ResonFilter(sampleRate);
    case 'comb': return new CombFilter(sampleRate);
    case 'echo': return new AuEchoFilter(sampleRate);
    case 'canyondelay': return new CanyonDelayFilter(sampleRate);
    case 'reverb': return new TReverbFilter(sampleRate);
    case 'phaser': return new AuPhaserFilter(sampleRate);
    case 'wahwah': return new AuWahwahFilter(sampleRate);
    case 'lfophaser': return new LFOPhaserFilter(sampleRate);
    case 'fourbyfour': return new FourByFourPoleFilter(sampleRate);
    case 'autophaser': return new AutoPhaserFilter(sampleRate);
    case 'autopan': return new TapAutopanFilter(sampleRate);
    case 'vcf303': return new Vcf303Filter(sampleRate);
    case 'plucked': return new PluckedStringFilter(sampleRate);
    case 'vynil': return new VynilFilter(sampleRate);
    case 'vacuum': return new VacuumTubeAmpFilter(sampleRate);
    case 'sigmoid': return new TapSigmoidFilter(sampleRate);
    case 'divider': return new DividerFilter(sampleRate);
    case 'shiftr': return new TShiftRFilter(sampleRate);
    case 'randmix': return new RandmixFilter(sampleRate);
    case 'amplify': return new AuAmplifyFilter(sampleRate);
    case 'compressor': return new CompressorFilter(sampleRate);
    case 'noisegate': return new NoiseGateFilter(sampleRate);
    case 'bitcrusher': return new BitcrusherFilter(sampleRate);
    case 'ringmod': return new RingModFilter(sampleRate);
    case 'moogladder': return new MoogLadderFilter(sampleRate);
    case 'svf': return new SvfFilter(sampleRate);
    case 'formant': return new FormantFilter(sampleRate);
    case 'flanger': return new FlangerFilter(sampleRate);
    case 'wavefolder': return new WavefolderFilter(sampleRate);
    case 'tremolo': return new TremoloFilter(sampleRate);
    default: return new AuAmplifyFilter(sampleRate);
  }
}
