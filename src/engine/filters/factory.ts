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
      { name: 'lo', label: 'Bass (dB)', type: 'float', min: -70, max: 20, step: 0.5, value: -10, tooltip: 'Low-frequency band gain' },
      { name: 'mid', label: 'Mid (dB)', type: 'float', min: -70, max: 20, step: 0.5, value: 1, tooltip: 'Midrange frequency band gain' },
      { name: 'hi', label: 'Treble (dB)', type: 'float', min: -70, max: 20, step: 0.5, value: -10, tooltip: 'High-frequency band gain' },
      { name: 'peakBw', label: 'Peak Bandwidth', type: 'float', min: 0.1, max: 2, step: 0.05, value: 0.3, tooltip: 'Q factor / sharpness of the mid bell peak' },
      { name: 'shelfSlope', label: 'Shelf Slope', type: 'float', min: 0.1, max: 3, step: 0.1, value: 1.5, tooltip: 'Slope steepness of low/high shelves' },
    ],
  },
  basstreble: {
    id: 'basstreble',
    name: 'Bass & Treble',
    category: 'eq',
    description: 'Audacity shelving tone control.',
    defaultSampleRate: 44100,
    params: [
      { name: 'dBBass', label: 'Bass (dB)', type: 'float', min: -30, max: 30, step: 0.5, value: 0, tooltip: 'Low shelf boost/cut' },
      { name: 'dBTreble', label: 'Treble (dB)', type: 'float', min: -30, max: 30, step: 0.5, value: 0, tooltip: 'High shelf boost/cut' },
      { name: 'hzBass', label: 'Bass Cutoff (Hz)', type: 'float', min: 50, max: 500, step: 10, value: 250, tooltip: 'Low shelf transition frequency' },
      { name: 'hzTreble', label: 'Treble Cutoff (Hz)', type: 'float', min: 1000, max: 8000, step: 50, value: 4000, tooltip: 'High shelf transition frequency' },
    ],
  },
  reson: {
    id: 'reson',
    name: 'Reson Filter',
    category: 'eq',
    description: 'Two-pole resonant bandpass filter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freqControl', label: 'Frequency (Hz)', type: 'float', min: 20, max: 10000, step: 10, value: 500, tooltip: 'Center resonant frequency' },
      { name: 'bwControl', label: 'Bandwidth (Hz)', type: 'float', min: 50, max: 2000, step: 10, value: 1000, tooltip: 'Resonance bandwidth / sharpness' },
    ],
  },
  comb: {
    id: 'comb',
    name: 'Comb Filter',
    category: 'delay',
    description: 'Feedback comb filter with cubic Hermite interpolation.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Frequency (Hz)', type: 'float', min: 10, max: 1000, step: 1, value: 100, tooltip: 'Fundamental comb delay pitch' },
      { name: 'feedback', label: 'Feedback', type: 'float', min: -0.99, max: 0.99, step: 0.01, value: 0.1, tooltip: 'Resonance feedback intensity' },
    ],
  },
  echo: {
    id: 'echo',
    name: 'Echo Delay',
    category: 'delay',
    description: 'Audacity audio echo with decay feedback.',
    defaultSampleRate: 44100,
    params: [
      { name: 'delay', label: 'Delay Time (s)', type: 'float', min: 0.001, max: 1.0, step: 0.001, value: 0.5, tooltip: 'Time between echo repeats' },
      { name: 'decay', label: 'Decay Factor', type: 'float', min: 0.0, max: 0.99, step: 0.01, value: 0.5, tooltip: 'Volume decay multiplier per echo' },
    ],
  },
  canyondelay: {
    id: 'canyondelay',
    name: 'Canyon Delay',
    category: 'delay',
    description: 'Stereo cross-feedback echo with lowpass damping.',
    defaultSampleRate: 44100,
    params: [
      { name: 'ltrTime', label: 'Left Time (s)', type: 'float', min: 0.001, max: 1.0, step: 0.005, value: 0.5, tooltip: 'Left-channel delay time' },
      { name: 'rtlTime', label: 'Right Time (s)', type: 'float', min: 0.001, max: 1.0, step: 0.005, value: 0.5, tooltip: 'Right-channel delay time' },
      { name: 'ltrFeedback', label: 'Left Feedback', type: 'float', min: -0.95, max: 0.95, step: 0.01, value: 0.1, tooltip: 'Left-to-right feedback amount' },
      { name: 'rtlFeedback', label: 'Right Feedback', type: 'float', min: -0.95, max: 0.95, step: 0.01, value: -0.1, tooltip: 'Right-to-left feedback amount' },
      { name: 'cutoff', label: 'Cutoff (Hz)', type: 'float', min: 100, max: 15000, step: 50, value: 1000, tooltip: 'High-frequency damping cutoff' },
    ],
  },
  reverb: {
    id: 'reverb',
    name: 'TReverb',
    category: 'delay',
    description: 'Long delay reverberation chamber.',
    defaultSampleRate: 44100,
    params: [
      { name: 'delayMs', label: 'Delay (ms)', type: 'float', min: 10, max: 8000, step: 10, value: 2000, tooltip: 'Acoustic chamber pre-delay time' },
      { name: 'decay', label: 'Decay', type: 'float', min: 0.05, max: 0.95, step: 0.01, value: 0.5, tooltip: 'Reverberation tail decay time' },
    ],
  },
  phaser: {
    id: 'phaser',
    name: 'Audacity Phaser',
    category: 'modulation',
    description: 'Multi-stage allpass phaser with exponential LFO.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'LFO Freq (Hz)', type: 'float', min: 0.01, max: 30, step: 0.05, value: 0.4, tooltip: 'Modulation sweep speed' },
      { name: 'stages', label: 'Stages', type: 'int', min: 1, max: 24, step: 1, value: 2, tooltip: 'Number of allpass phase-shift stages' },
      { name: 'dryWet', label: 'Dry/Wet', type: 'int', min: 0, max: 255, step: 1, value: 128, tooltip: 'Mix balance between dry and phased signal' },
      { name: 'depth', label: 'Depth', type: 'int', min: 0, max: 255, step: 1, value: 100, tooltip: 'Frequency sweep range width' },
      { name: 'feedback', label: 'Feedback', type: 'float', min: -95, max: 95, step: 1, value: 0, tooltip: 'Resonance feedback across stages' },
    ],
  },
  wahwah: {
    id: 'wahwah',
    name: 'Wahwah',
    category: 'modulation',
    description: 'Swept resonance bandpass filter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'LFO Freq (Hz)', type: 'float', min: 0.1, max: 30, step: 0.1, value: 15, tooltip: 'Wah sweep modulation frequency' },
      { name: 'depth', label: 'Depth (%)', type: 'float', min: 0, max: 100, step: 1, value: 70, tooltip: 'Sweep modulation depth' },
      { name: 'resonance', label: 'Resonance', type: 'float', min: 0.5, max: 50, step: 0.5, value: 25, tooltip: 'Peak resonant filter sharpness (Q)' },
      { name: 'freqOfs', label: 'Freq Offset', type: 'float', min: 0, max: 100, step: 1, value: 30, tooltip: 'Center frequency start position' },
    ],
  },
  lfophaser: {
    id: 'lfophaser',
    name: 'LFO Phaser',
    category: 'modulation',
    description: 'SWH 6-stage allpass phaser.',
    defaultSampleRate: 44100,
    params: [
      { name: 'lfoRate', label: 'LFO Rate', type: 'float', min: 0.001, max: 50, step: 0.01, value: 0.001, tooltip: 'LFO cycle rate in Hz' },
      { name: 'lfoDepth', label: 'Depth', type: 'float', min: 0, max: 1, step: 0.01, value: 0.5, tooltip: 'Phase modulation depth' },
      { name: 'fb', label: 'Feedback', type: 'float', min: -0.99, max: 0.99, step: 0.01, value: 0, tooltip: 'Regenerative stage feedback' },
      { name: 'spread', label: 'Spread', type: 'float', min: 0.1, max: 3, step: 0.1, value: 1, tooltip: 'Pole frequency separation spread' },
    ],
  },
  fourbyfour: {
    id: 'fourbyfour',
    name: '4x4 Pole Filter Bank',
    category: 'modulation',
    description: '16 allpass stages grouped into 4 poles.',
    defaultSampleRate: 44100,
    params: [
      { name: 'f0', label: 'Freq 0 (Hz)', type: 'float', min: 10, max: 20000, step: 100, value: 10, tooltip: 'Band 0 pole frequency' },
      { name: 'f1', label: 'Freq 1 (Hz)', type: 'float', min: 10, max: 20000, step: 100, value: 10000, tooltip: 'Band 1 pole frequency' },
      { name: 'f2', label: 'Freq 2 (Hz)', type: 'float', min: 10, max: 20000, step: 100, value: 15000, tooltip: 'Band 2 pole frequency' },
      { name: 'f3', label: 'Freq 3 (Hz)', type: 'float', min: 10, max: 20000, step: 100, value: 20000, tooltip: 'Band 3 pole frequency' },
      { name: 'fb0', label: 'Feedback 0', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0, tooltip: 'Band 0 feedback amount' },
      { name: 'fb1', label: 'Feedback 1', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0, tooltip: 'Band 1 feedback amount' },
      { name: 'fb2', label: 'Feedback 2', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0, tooltip: 'Band 2 feedback amount' },
      { name: 'fb3', label: 'Feedback 3', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0, tooltip: 'Band 3 feedback amount' },
    ],
  },
  autophaser: {
    id: 'autophaser',
    name: 'Auto Phaser',
    category: 'modulation',
    description: 'Dynamic phaser controlled by an envelope follower.',
    defaultSampleRate: 44100,
    params: [
      { name: 'attackP', label: 'Attack', type: 'float', min: 0.01, max: 1, step: 0.01, value: 0.1, tooltip: 'Envelope follower rise time' },
      { name: 'decayP', label: 'Decay', type: 'float', min: 0.01, max: 1, step: 0.01, value: 0.1, tooltip: 'Envelope follower fall time' },
      { name: 'depthP', label: 'Depth', type: 'float', min: 0.01, max: 1, step: 0.01, value: 0.1, tooltip: 'Envelope-to-filter modulation amount' },
      { name: 'fb', label: 'Feedback', type: 'float', min: -0.95, max: 0.95, step: 0.01, value: 0, tooltip: 'Phaser loop feedback' },
    ],
  },
  autopan: {
    id: 'autopan',
    name: 'Auto Pan',
    category: 'modulation',
    description: 'Stereo panning LFO modulation.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Rate (Hz)', type: 'float', min: 0.1, max: 20, step: 0.1, value: 5, tooltip: 'Stereo pan cycle speed' },
      { name: 'depth', label: 'Depth (%)', type: 'float', min: 0, max: 100, step: 1, value: 10, tooltip: 'Stereo field panning width' },
      { name: 'gain', label: 'Gain (dB)', type: 'float', min: -20, max: 20, step: 0.5, value: 1, tooltip: 'Output booster gain' },
    ],
  },
  vcf303: {
    id: 'vcf303',
    name: 'Roland TB-303 VCF',
    category: 'synth',
    description: 'Diode ladder voltage-controlled resonant acid filter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'cutoff', label: 'Cutoff', type: 'float', min: 0.05, max: 1, step: 0.01, value: 0.5, tooltip: 'Base diode ladder filter cutoff frequency' },
      { name: 'resonance', label: 'Resonance', type: 'float', min: 0.1, max: 1, step: 0.01, value: 1, tooltip: 'Feedback peak near self-oscillation' },
      { name: 'envMod', label: 'Env Mod', type: 'float', min: 0, max: 1, step: 0.01, value: 0.5, tooltip: 'Envelope depth opening the cutoff' },
      { name: 'decay', label: 'Decay', type: 'float', min: 0.1, max: 2, step: 0.05, value: 1, tooltip: 'Decay time of the acid envelope' },
    ],
  },
  plucked: {
    id: 'plucked',
    name: 'Plucked String',
    category: 'synth',
    description: 'Karplus-Strong physical string synthesis model.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Freq (Hz)', type: 'float', min: 40, max: 8000, step: 10, value: 1000, tooltip: 'Fundamental string resonance pitch' },
      { name: 'sharp', label: 'Sharpness', type: 'float', min: 0.1, max: 0.99, step: 0.01, value: 0.5, tooltip: 'High-frequency string damping and decay length' },
    ],
  },
  vynil: {
    id: 'vynil',
    name: 'Vinyl Record Dust',
    category: 'distortion',
    description: 'Mechanical turntable warp, surface wear, and clicks.',
    defaultSampleRate: 44100,
    params: [
      { name: 'year', label: 'Release Year', type: 'float', min: 1900, max: 1990, step: 1, value: 1987, tooltip: 'Bandwidth & tonal curve of the pressing era' },
      { name: 'rpm', label: 'RPM', type: 'float', min: 33, max: 78, step: 1, value: 63, tooltip: 'Turntable rotational speed in revolutions per minute' },
      { name: 'warp', label: 'Motor Warp', type: 'float', min: 0, max: 0.4, step: 0.01, value: 0.45, tooltip: 'Periodic platter pitch wow and flutter' },
      { name: 'click', label: 'Click Rate', type: 'float', min: 0, max: 1, step: 0.01, value: 0.235, tooltip: 'Frequency of surface pops and needle dust clicks' },
      { name: 'wear', label: 'Groove Wear', type: 'float', min: 0, max: 1, step: 0.01, value: 0, tooltip: 'Continuous high-frequency surface noise & hiss' },
    ],
  },
  vacuum: {
    id: 'vacuum',
    name: 'Vacuum Tube Amp',
    category: 'distortion',
    description: 'Analog vacuum tube saturation curve.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rangeA', label: 'Negative Knee', type: 'float', min: -0.99, max: -0.1, step: 0.01, value: -0.5, tooltip: 'Negative signal saturation threshold' },
      { name: 'rangeB', label: 'Positive Knee', type: 'float', min: 0.1, max: 0.99, step: 0.01, value: 0.5, tooltip: 'Positive signal saturation threshold' },
    ],
  },
  sigmoid: {
    id: 'sigmoid',
    name: 'Sigmoid Overdrive',
    category: 'distortion',
    description: 'Soft sigmoid overdrive saturation.',
    defaultSampleRate: 44100,
    params: [
      { name: 'fact', label: 'Factor', type: 'float', min: -10, max: -1, step: 0.1, value: -5, tooltip: 'Overdrive saturation curvature amount' },
    ],
  },
  divider: {
    id: 'divider',
    name: 'Subharmonic Divider',
    category: 'distortion',
    description: 'Zero-crossing pitch flip-flop frequency divider.',
    defaultSampleRate: 44100,
    params: [
      { name: 'denominator', label: 'Divider Ratio', type: 'int', min: 1, max: 32, step: 1, value: 2, tooltip: 'Sub-octave division factor (e.g. 2 = one octave down)' },
    ],
  },
  shiftr: {
    id: 'shiftr',
    name: 'TShiftR Fold',
    category: 'distortion',
    description: 'Square root feedback fold distortion.',
    defaultSampleRate: 44100,
    params: [
      { name: 'mPasses', label: 'Passes', type: 'int', min: 1, max: 10, step: 1, value: 5, tooltip: 'Number of wave folding iterations' },
      { name: 'mDiv', label: 'Divisor', type: 'float', min: 0.5, max: 5, step: 0.1, value: 1, tooltip: 'Folding amplitude normalization scaling' },
    ],
  },
  randmix: {
    id: 'randmix',
    name: 'Randmix FIR',
    category: 'distortion',
    description: 'Randomized impulse response history filter.',
    defaultSampleRate: 44100,
    params: [
      { name: 'tail', label: 'Tail Length', type: 'int', min: 2, max: 40, step: 1, value: 10, tooltip: 'Sample history window size for randomized diffusion' },
    ],
  },
  amplify: {
    id: 'amplify',
    name: 'Amplify',
    category: 'distortion',
    description: 'Linear gain multiplier.',
    defaultSampleRate: 44100,
    params: [
      { name: 'amp', label: 'Gain Multiplier', type: 'float', min: 0.1, max: 10, step: 0.1, value: 1.0, tooltip: 'Linear output gain amplification factor' },
    ],
  },
  compressor: {
    id: 'compressor',
    name: 'Studio Compressor',
    category: 'dynamics',
    description: 'Dynamic range compressor and peak limiter with auto-exposure tone mapping.',
    defaultSampleRate: 44100,
    params: [
      { name: 'threshold', label: 'Thresh (dB)', type: 'float', min: -60, max: 0, step: 1, value: -18, tooltip: 'Compression onset threshold in dB' },
      { name: 'ratio', label: 'Ratio (:1)', type: 'float', min: 1, max: 20, step: 0.5, value: 4, tooltip: 'Gain reduction ratio above threshold' },
      { name: 'attack', label: 'Attack (ms)', type: 'float', min: 0.1, max: 100, step: 0.5, value: 10, tooltip: 'Gain reduction reaction speed' },
      { name: 'release', label: 'Release (ms)', type: 'float', min: 10, max: 1000, step: 10, value: 100, tooltip: 'Gain recovery recovery speed' },
      { name: 'makeupGain', label: 'Gain (dB)', type: 'float', min: 0, max: 24, step: 0.5, value: 3, tooltip: 'Post-compression makeup output gain' },
    ],
  },
  noisegate: {
    id: 'noisegate',
    name: 'Noise Gate',
    category: 'dynamics',
    description: 'Downward noise gate squelch for high-contrast shadow isolation.',
    defaultSampleRate: 44100,
    params: [
      { name: 'threshold', label: 'Thresh (dB)', type: 'float', min: -80, max: 0, step: 1, value: -36, tooltip: 'Gate opening threshold level in dB' },
      { name: 'range', label: 'Range (dB)', type: 'float', min: -80, max: 0, step: 1, value: -40, tooltip: 'Maximum attenuation applied when gate is shut' },
      { name: 'attack', label: 'Attack (ms)', type: 'float', min: 0.1, max: 50, step: 0.5, value: 5, tooltip: 'Speed gate opens once signal exceeds threshold' },
      { name: 'release', label: 'Release (ms)', type: 'float', min: 10, max: 500, step: 10, value: 100, tooltip: 'Speed gate closes once signal drops below threshold' },
    ],
  },
  bitcrusher: {
    id: 'bitcrusher',
    name: 'Bitcrusher & Decimator',
    category: 'lofi',
    description: 'Bit-depth quantization and sample-rate decimation for chiptune crunch.',
    defaultSampleRate: 44100,
    params: [
      { name: 'bits', label: 'Bit Depth', type: 'int', min: 1, max: 16, step: 1, value: 6, tooltip: 'Bit resolution reduction (1-16 bits)' },
      { name: 'downsample', label: 'Decimate', type: 'int', min: 1, max: 64, step: 1, value: 8, tooltip: 'Sample rate decimation factor for aliasing tones' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 1, tooltip: 'Dry/wet balance' },
    ],
  },
  ringmod: {
    id: 'ringmod',
    name: 'Ring Modulator',
    category: 'modulation',
    description: 'Carrier multiplication creating metallic sidebands and moiré interference.',
    defaultSampleRate: 44100,
    params: [
      { name: 'freq', label: 'Freq (Hz)', type: 'float', min: 10, max: 4000, step: 10, value: 440, tooltip: 'Carrier oscillator frequency in Hz' },
      { name: 'waveform', label: 'Waveform', type: 'int', min: 0, max: 2, step: 1, value: 0, tooltip: 'Carrier shape: 0=Sine, 1=Triangle, 2=Square' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 0.85, tooltip: 'Balance between unaffected and modulated carrier' },
    ],
  },
  moogladder: {
    id: 'moogladder',
    name: 'Moog 24dB Ladder',
    category: 'eq',
    description: '4-pole resonant transistor ladder filter with nonlinear tanh feedback.',
    defaultSampleRate: 44100,
    params: [
      { name: 'cutoff', label: 'Cutoff (Hz)', type: 'float', min: 20, max: 18000, step: 50, value: 1200, tooltip: '4-pole 24dB/octave cutoff frequency' },
      { name: 'resonance', label: 'Resonance', type: 'float', min: 0, max: 4, step: 0.1, value: 2.2, tooltip: 'Transistor ladder feedback peak (self-oscillates above 3.5)' },
      { name: 'drive', label: 'Drive', type: 'float', min: 1, max: 5, step: 0.1, value: 1.5, tooltip: 'Input saturation drive into the ladder core' },
    ],
  },
  svf: {
    id: 'svf',
    name: 'State Variable Filter',
    category: 'eq',
    description: 'Multi-mode 12dB/oct filter morphing from Lowpass to Bandpass, Highpass & Notch.',
    defaultSampleRate: 44100,
    params: [
      { name: 'cutoff', label: 'Cutoff (Hz)', type: 'float', min: 20, max: 18000, step: 50, value: 1500, tooltip: 'State-variable corner frequency' },
      { name: 'res', label: 'Q Res', type: 'float', min: 0.5, max: 10, step: 0.25, value: 2.0, tooltip: 'Filter resonance sharpness (Q)' },
      { name: 'mode', label: 'Mode (LP-BP-HP-N)', type: 'float', min: 0, max: 3, step: 0.1, value: 0.0, tooltip: 'Filter mode morph: 0=Lowpass, 1=Bandpass, 2=Highpass, 3=Notch' },
    ],
  },
  formant: {
    id: 'formant',
    name: 'Formant Resonator',
    category: 'eq',
    description: 'Vocal tract acoustic resonator morphing across /A/, /E/, /I/, /O/, /U/.',
    defaultSampleRate: 44100,
    params: [
      { name: 'vowel', label: 'Vowel (A-E-I-O-U)', type: 'float', min: 0, max: 4, step: 0.1, value: 0.0, tooltip: 'Vowel formant position (0:A, 1:E, 2:I, 3:O, 4:U)' },
      { name: 'resonance', label: 'Formant Q', type: 'float', min: 1, max: 20, step: 0.5, value: 8.0, tooltip: 'Acoustic vocal tract resonance peak width' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 0.9, tooltip: 'Formant resonator mix amount' },
    ],
  },
  flanger: {
    id: 'flanger',
    name: 'Flanger & Chorus',
    category: 'modulation',
    description: 'Modulated delay line with feedback for jet-plane sweeps and lush chorus.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rate', label: 'Rate (Hz)', type: 'float', min: 0.05, max: 10, step: 0.05, value: 0.4, tooltip: 'LFO modulation frequency in Hz' },
      { name: 'depth', label: 'Depth (ms)', type: 'float', min: 0.5, max: 10, step: 0.25, value: 3.0, tooltip: 'Delay time modulation excursion depth' },
      { name: 'feedback', label: 'Feedback', type: 'float', min: -0.95, max: 0.95, step: 0.05, value: 0.6, tooltip: 'Regenerative comb feedback for jet sweep intensity' },
      { name: 'delayMs', label: 'Delay (ms)', type: 'float', min: 0.5, max: 20, step: 0.5, value: 2.0, tooltip: 'Center delay offset (chorus vs flanger range)' },
      { name: 'mix', label: 'Dry/Wet', type: 'float', min: 0, max: 1, step: 0.05, value: 0.5, tooltip: 'Mix blend ratio' },
    ],
  },
  wavefolder: {
    id: 'wavefolder',
    name: 'Buchla Wavefolder',
    category: 'distortion',
    description: 'West-Coast nonlinear wavefolder creating harmonic brilliance and psychedelic color folds.',
    defaultSampleRate: 44100,
    params: [
      { name: 'drive', label: 'Drive', type: 'float', min: 1, max: 10, step: 0.2, value: 2.5, tooltip: 'Input amplification driving the folding diodes' },
      { name: 'folds', label: 'Folds', type: 'int', min: 1, max: 6, step: 1, value: 3, tooltip: 'Number of cascading wave fold stages' },
      { name: 'symmetry', label: 'Symmetry', type: 'float', min: -1, max: 1, step: 0.05, value: 0.0, tooltip: 'DC bias offsetting even vs odd harmonics' },
    ],
  },
  tremolo: {
    id: 'tremolo',
    name: 'Tremolo & Strobe',
    category: 'modulation',
    description: 'LFO amplitude modulation producing rhythmic pulses and zebra strobe bands.',
    defaultSampleRate: 44100,
    params: [
      { name: 'rate', label: 'Rate (Hz)', type: 'float', min: 0.5, max: 25, step: 0.25, value: 4.0, tooltip: 'Tremolo pulse rate in Hz' },
      { name: 'depth', label: 'Depth', type: 'float', min: 0, max: 1, step: 0.05, value: 0.7, tooltip: 'Volume modulation depth (strobe contrast)' },
      { name: 'shape', label: 'Waveform', type: 'int', min: 0, max: 2, step: 1, value: 0, tooltip: 'LFO shape: 0=Sine, 1=Triangle, 2=Square' },
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
