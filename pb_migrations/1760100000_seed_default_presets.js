/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const presets = app.findCollectionByNameOrId('presets');

  // Ensure isDefault field exists
  let hasIsDefault = false;
  try {
    hasIsDefault = !!presets.fields.getByName('isDefault');
  } catch {}
  if (!hasIsDefault) {
    presets.fields.add(new BoolField({
      name: 'isDefault',
    }));
    app.save(presets);
  }

  // Remove existing presets (migration happens once)
  try {
    app.db().newQuery('DELETE FROM presets').execute();
  } catch (err) {
    console.log('Note on deleting existing presets:', err);
  }

  // Locate or create target user owner
  let user;
  try {
    user = app.findFirstRecordByFilter('users', 'username = "vasily"');
  } catch {}
  if (!user) {
    try {
      const allUsers = app.findRecordsByFilter('users', '1=1', '-created', 1);
      if (allUsers.length > 0) user = allUsers[0];
    } catch {}
  }
  if (!user) {
    const users = app.findCollectionByNameOrId('users');
    user = new Record(users);
    user.set('username', 'vasily');
    user.setPassword('sokaris2020');
    app.save(user);
  }

  const CURATED_PRESETS = [
    {
      id: 'magnetic_oxide_decay',
      name: 'Magnetic Oxide Decay',
      description: '1970s reel-to-reel tape saturation with physical wow & flutter drift, head-bump, and micro-dropouts.',
      reader: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      writer: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'tapesat', enabled: true, sampleRate: 44100, params: { drive: 3.8, bias: 0.12, bump: 0.65, bumpHz: 80, tone: 6500 } },
        { id: 'f2', type: 'tapewow', enabled: true, sampleRate: 44100, params: { wow: 0.45, flutter: 0.35, drift: 0.4, mix: 0.85 } },
        { id: 'f3', type: 'dropout', enabled: true, sampleRate: 44100, params: { rate: 2.2, length: 70, smooth: 6, depth: 0.9 } },
        { id: 'f4', type: 'hiss', enabled: true, sampleRate: 44100, params: { level: 0.08, tilt: 0.4, ducking: 0.6 } },
      ],
    },
    {
      id: 'shortwave_radio',
      name: 'Transatlantic Shortwave Radio',
      description: 'Narrowband telecommunications bandpass with heterodyne ring modulation and atmospheric RF noise bursts.',
      reader: { rawType: 'INTERLEAVED', law: 'U_LAW', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'CMY' },
      writer: { rawType: 'INTERLEAVED', law: 'U_LAW', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'CMY' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'telephone', enabled: true, sampleRate: 44100, params: { lowCut: 350, highCut: 3100, noise: 0.15, crackle: 0.35 } },
        { id: 'f2', type: 'ringmod', enabled: true, sampleRate: 44100, params: { freq: 1750, waveform: 0, mix: 0.25 } },
        { id: 'f3', type: 'hiss', enabled: true, sampleRate: 44100, params: { level: 0.12, tilt: 0.7, ducking: 0.3 } },
        { id: 'f4', type: 'limiter', enabled: true, sampleRate: 44100, params: { ceiling: -1.5, release: 80, drive: 4 } },
      ],
    },
    {
      id: 'ghost_walkman',
      name: 'Ghost Walkman Drift',
      description: 'Battery-starved portable cassette transport with heavy wow, tape saturation, and expansive cavernous echoes.',
      reader: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LUV' },
      writer: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LUV' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'tapewow', enabled: true, sampleRate: 44100, params: { wow: 0.75, flutter: 0.5, drift: 0.6, mix: 1.0 } },
        { id: 'f2', type: 'tapesat', enabled: true, sampleRate: 44100, params: { drive: 4.5, bias: 0.2, bump: 0.5, bumpHz: 90, tone: 5200 } },
        { id: 'f3', type: 'canyondelay', enabled: true, sampleRate: 44100, params: { ltrTime: 0.28, rtlTime: 0.42, ltrFeedback: 0.55, rtlFeedback: -0.4, cutoff: 2200 } },
        { id: 'f4', type: 'expander', enabled: true, sampleRate: 44100, params: { threshold: -36, ratio: 3.5, attack: 4, release: 220 } },
      ],
    },
    {
      id: 'westcoast_spectral_fold',
      name: 'West-Coast Spectral Fold',
      description: 'Buchla-inspired complex FM phase operator feeding multi-stage wavefolding and envelope-swept filtering.',
      reader: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'HCL' },
      writer: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'HCL' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'fmop', enabled: true, sampleRate: 44100, params: { freq: 130, index: 5.5, feedback: 0.35, mix: 0.75 } },
        { id: 'f2', type: 'wavefolder', enabled: true, sampleRate: 44100, params: { drive: 3.8, folds: 4, symmetry: -0.15 } },
        { id: 'f3', type: 'envfilter', enabled: true, sampleRate: 44100, params: { sensitivity: 5.0, minFreq: 250, maxFreq: 5500, q: 4.2, mode: 1 } },
        { id: 'f4', type: 'limiter', enabled: true, sampleRate: 44100, params: { ceiling: -0.5, release: 60, drive: 2.0 } },
      ],
    },
    {
      id: 'subharmonic_monolith',
      name: 'Subharmonic Monolith Bass',
      description: 'Dual-octave-down zero-crossing sub-oscillator driven into 24dB Moog ladder lowpass and aggressive transient shaping.',
      reader: { rawType: 'INTERLEAVED', law: 'U_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      writer: { rawType: 'INTERLEAVED', law: 'U_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'suboct', enabled: true, sampleRate: 44100, params: { octaves: 2, level: 0.85, lowpass: 120 } },
        { id: 'f2', type: 'moogladder', enabled: true, sampleRate: 44100, params: { cutoff: 380, resonance: 3.2, drive: 4.0 } },
        { id: 'f3', type: 'transient', enabled: true, sampleRate: 44100, params: { attack: 0.6, sustain: 0.4 } },
        { id: 'f4', type: 'compressor', enabled: true, sampleRate: 44100, params: { threshold: -16, ratio: 6, attack: 15, release: 180, makeupGain: 4 } },
      ],
    },
    {
      id: 'sh_random_glitch',
      name: 'Random S&H Buchla Bleeps',
      description: 'Sample-and-hold stepped random resonant filter modulation crushed through a jittery sample rate reducer.',
      reader: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' },
      writer: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'shrandom', enabled: true, sampleRate: 44100, params: { rate: 6.0, depth: 0.85, base: 350, q: 6.5, slew: 15 } },
        { id: 'f2', type: 'srreducer', enabled: true, sampleRate: 44100, params: { rate: 6500, jitter: 0.35, mix: 0.9 } },
        { id: 'f3', type: 'echo', enabled: true, sampleRate: 44100, params: { delay: 0.14, decay: 0.45 } },
        { id: 'f4', type: 'limiter', enabled: true, sampleRate: 44100, params: { ceiling: -1.0, release: 50, drive: 1.5 } },
      ],
    },
    {
      id: 'drone_harmonizer',
      name: 'Drone Harmonizer Horizon',
      description: 'Detuned analog saw drone tracking input amplitude, pitch-shifted a perfect fifth into lush 3-band multiband compression.',
      reader: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'XYZ' },
      writer: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'XYZ' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'drone', enabled: true, sampleRate: 44100, params: { wave: 1, freq: 82.4, detune: 12, level: 0.5, follow: 0.4 } },
        { id: 'f2', type: 'pitchshift', enabled: true, sampleRate: 44100, params: { semitones: 7, window: 80, mix: 0.6 } },
        { id: 'f3', type: 'reverb', enabled: true, sampleRate: 44100, params: { delayMs: 650, decay: 0.7 } },
        { id: 'f4', type: 'multiband', enabled: true, sampleRate: 44100, params: { xLow: 220, xHigh: 3000, threshold: -18, ratio: 3.5, low: 1, mid: 0.8, high: 0.6, attack: 20, release: 250, makeup: 3 } },
      ],
    },
    {
      id: 'sympathetic_resonator',
      name: 'Sympathetic String Harp',
      description: 'Four-string Karplus resonator bank tuned to acoustic intervals, singing through cross-coupled canyon delays.',
      reader: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      writer: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'resbank', enabled: true, sampleRate: 44100, params: { root: 146.8, spread: 5, decay: 0.965, damping: 0.25, mix: 0.8 } },
        { id: 'f2', type: 'canyondelay', enabled: true, sampleRate: 44100, params: { ltrTime: 0.2, rtlTime: 0.3, ltrFeedback: 0.4, rtlFeedback: -0.3, cutoff: 2800 } },
        { id: 'f3', type: 'compressor', enabled: true, sampleRate: 44100, params: { threshold: -20, ratio: 4, attack: 10, release: 200, makeupGain: 3 } },
      ],
    },
    {
      id: 'granular_cloud_shimmer',
      name: 'Granular Cloud Shimmer',
      description: 'Micro-grain re-synthesis scattered with octave-up pitch transposition and ethereal reverberant diffusion.',
      reader: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'XYZ' },
      writer: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'XYZ' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'granular', enabled: true, sampleRate: 44100, params: { size: 65, density: 24, pitchScatter: 5, posJitter: 140, mix: 0.85 } },
        { id: 'f2', type: 'pitchshift', enabled: true, sampleRate: 44100, params: { semitones: 12, window: 60, mix: 0.5 } },
        { id: 'f3', type: 'reverb', enabled: true, sampleRate: 44100, params: { delayMs: 800, decay: 0.65 } },
        { id: 'f4', type: 'limiter', enabled: true, sampleRate: 44100, params: { ceiling: -1.0, release: 100, drive: 2.0 } },
      ],
    },
    {
      id: 'karplus_comb_chamber',
      name: 'Karplus Plucked Chamber',
      description: 'Excited physical string impulse fed into a tuned comb resonator and room decay with transient attack bite.',
      reader: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'LUV' },
      writer: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'LUV' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'plucked', enabled: true, sampleRate: 44100, params: { freq: 440, sharp: 0.88 } },
        { id: 'f2', type: 'comb', enabled: true, sampleRate: 44100, params: { freq: 220, feedback: 0.68 } },
        { id: 'f3', type: 'reverb', enabled: true, sampleRate: 44100, params: { delayMs: 320, decay: 0.45 } },
        { id: 'f4', type: 'transient', enabled: true, sampleRate: 44100, params: { attack: 0.55, sustain: -0.2 } },
      ],
    },
    {
      id: 'cyber_vocoder',
      name: 'Cybernetic Vocoder Carrier',
      description: '12-band spectral analysis vocoder modulating a saw-wave carrier with vowel formant boost and jet-plane flanging.',
      reader: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' },
      writer: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'vocoder', enabled: true, sampleRate: 44100, params: { bands: 12, q: 6.5, carrier: 1, freq: 110, mix: 0.95 } },
        { id: 'f2', type: 'formant', enabled: true, sampleRate: 44100, params: { vowel: 1.8, resonance: 10, mix: 0.6 } },
        { id: 'f3', type: 'flanger', enabled: true, sampleRate: 44100, params: { rate: 0.3, depth: 4.0, feedback: 0.65, delayMs: 3.5, mix: 0.4 } },
        { id: 'f4', type: 'limiter', enabled: true, sampleRate: 44100, params: { ceiling: -0.5, release: 45, drive: 3.0 } },
      ],
    },
    {
      id: 'vocaloid_shimmer',
      name: 'Vocaloid Shimmer Swarm',
      description: 'Granular pitch transposer feeding human vocal tract formants with cross-stereo delay and rhythmic ducking.',
      reader: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'HCL' },
      writer: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'HCL' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'pitchshift', enabled: true, sampleRate: 44100, params: { semitones: 8.5, window: 45, mix: 0.7 } },
        { id: 'f2', type: 'formant', enabled: true, sampleRate: 44100, params: { vowel: 0.8, resonance: 12, mix: 0.75 } },
        { id: 'f3', type: 'canyondelay', enabled: true, sampleRate: 44100, params: { ltrTime: 0.16, rtlTime: 0.24, ltrFeedback: 0.5, rtlFeedback: -0.35, cutoff: 4000 } },
        { id: 'f4', type: 'ducker', enabled: true, sampleRate: 44100, params: { rate: 3.5, depth: 0.65, shape: 1 } },
      ],
    },
    {
      id: 'french_touch_pump',
      name: 'French Touch Sidechain Pump',
      description: 'Heavy 4-on-the-floor ducker sidechain pumping through warm Moog ladder filtering and brickwall output limiting.',
      reader: { rawType: 'INTERLEAVED', law: 'U_LAW', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'OHTA' },
      writer: { rawType: 'INTERLEAVED', law: 'U_LAW', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'OHTA' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'transient', enabled: true, sampleRate: 44100, params: { attack: 0.7, sustain: 0.3 } },
        { id: 'f2', type: 'moogladder', enabled: true, sampleRate: 44100, params: { cutoff: 750, resonance: 2.8, drive: 3.5 } },
        { id: 'f3', type: 'ducker', enabled: true, sampleRate: 44100, params: { rate: 2.2, depth: 0.9, shape: 0 } },
        { id: 'f4', type: 'limiter', enabled: true, sampleRate: 44100, params: { ceiling: -0.2, release: 75, drive: 5.0 } },
      ],
    },
    {
      id: 'transient_smasher',
      name: 'Transient Smasher Saturation',
      description: 'Parallel-style transient onset booster slammed into folding saturation and punchy 3-band multiband dynamics.',
      reader: { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' },
      writer: { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'transient', enabled: true, sampleRate: 44100, params: { attack: 0.9, sustain: -0.4 } },
        { id: 'f2', type: 'wavefolder', enabled: true, sampleRate: 44100, params: { drive: 2.4, folds: 2, symmetry: 0.1 } },
        { id: 'f3', type: 'multiband', enabled: true, sampleRate: 44100, params: { xLow: 180, xHigh: 3200, threshold: -22, ratio: 6, low: 1, mid: 1, high: 0.8, attack: 5, release: 80, makeup: 4 } },
        { id: 'f4', type: 'limiter', enabled: true, sampleRate: 44100, params: { ceiling: -0.1, release: 40, drive: 3.0 } },
      ],
    },
    {
      id: 'gated_reverb_80s',
      name: '1980s Gated Reverb Snare',
      description: 'Dense room acoustics abruptly truncated by a fast downward noise gate and glued with warm tape saturation.',
      reader: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      writer: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'reverb', enabled: true, sampleRate: 44100, params: { delayMs: 380, decay: 0.85 } },
        { id: 'f2', type: 'noisegate', enabled: true, sampleRate: 44100, params: { threshold: -22, range: -60, attack: 1, release: 45 } },
        { id: 'f3', type: 'multiband', enabled: true, sampleRate: 44100, params: { xLow: 250, xHigh: 2800, threshold: -14, ratio: 4, low: 0.9, mid: 1, high: 1, attack: 8, release: 100, makeup: 3 } },
        { id: 'f4', type: 'tapesat', enabled: true, sampleRate: 44100, params: { drive: 3.0, bias: 0.05, bump: 0.3, bumpHz: 100, tone: 9000 } },
      ],
    },
    {
      id: 'quantum_decimator',
      name: 'Quantum Sample Rate Decimator',
      description: 'Downsampled zero-order-hold decimation with random clock jitter and envelope-following resonant filter sweeps.',
      reader: { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' },
      writer: { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'srreducer', enabled: true, sampleRate: 44100, params: { rate: 3200, jitter: 0.6, mix: 1.0 } },
        { id: 'f2', type: 'bitcrusher', enabled: true, sampleRate: 44100, params: { bits: 4, downsample: 4, mix: 0.9 } },
        { id: 'f3', type: 'envfilter', enabled: true, sampleRate: 44100, params: { sensitivity: 6.0, minFreq: 150, maxFreq: 4200, q: 5.0, mode: 0 } },
        { id: 'f4', type: 'limiter', enabled: true, sampleRate: 44100, params: { ceiling: -0.5, release: 30, drive: 2.0 } },
      ],
    },
    {
      id: 'granular_tape_stutter',
      name: 'Granular Tape Stutter',
      description: 'Micro-grain audio loop fragments interrupted by tape dropouts and stereo ping-pong spatial panning.',
      reader: { rawType: 'PLANAR', law: 'U_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'YXY' },
      writer: { rawType: 'PLANAR', law: 'U_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'YXY' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'granular', enabled: true, sampleRate: 44100, params: { size: 25, density: 35, pitchScatter: 1.5, posJitter: 220, mix: 0.9 } },
        { id: 'f2', type: 'dropout', enabled: true, sampleRate: 44100, params: { rate: 6.0, length: 30, smooth: 1.5, depth: 1.0 } },
        { id: 'f3', type: 'autopan', enabled: true, sampleRate: 44100, params: { freq: 3.2, depth: 70, gain: 1.5 } },
        { id: 'f4', type: 'compressor', enabled: true, sampleRate: 44100, params: { threshold: -18, ratio: 4, attack: 8, release: 120, makeupGain: 2 } },
      ],
    },
    {
      id: 'acid_string_swarm',
      name: 'Acid Diode Resonator Swarm',
      description: 'High-resonance TB-303 diode sweeps driving a tuned 4-string resonator bank into soft sigmoid saturation.',
      reader: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      writer: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'vcf303', enabled: true, sampleRate: 44100, params: { cutoff: 0.65, resonance: 0.88, envMod: 0.8, decay: 0.9 } },
        { id: 'f2', type: 'resbank', enabled: true, sampleRate: 44100, params: { root: 164.8, spread: 7, decay: 0.94, damping: 0.35, mix: 0.7 } },
        { id: 'f3', type: 'sigmoid', enabled: true, sampleRate: 44100, params: { fact: -5.0 } },
        { id: 'f4', type: 'echo', enabled: true, sampleRate: 44100, params: { delay: 0.09, decay: 0.5 } },
      ],
    },
    {
      id: 'abyssal_drone_chasm',
      name: 'Abyssal Dark Drone Chasm',
      description: 'Subterranean dual-oscillator drone running through long stereo feedback echoes, SVF damping, and tape motor drift.',
      reader: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LUV' },
      writer: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LUV' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'drone', enabled: true, sampleRate: 44100, params: { wave: 0, freq: 55, detune: 6, level: 0.6, follow: 0.2 } },
        { id: 'f2', type: 'canyondelay', enabled: true, sampleRate: 44100, params: { ltrTime: 0.45, rtlTime: 0.65, ltrFeedback: 0.65, rtlFeedback: -0.55, cutoff: 950 } },
        { id: 'f3', type: 'svf', enabled: true, sampleRate: 44100, params: { cutoff: 650, res: 3.5, mode: 0.2 } },
        { id: 'f4', type: 'tapewow', enabled: true, sampleRate: 44100, params: { wow: 0.55, flutter: 0.2, drift: 0.5, mix: 0.7 } },
      ],
    },
    {
      id: 'prismatic_diffusion',
      name: 'Prismatic Spatial Diffusion',
      description: 'Granular texture particles diffusing across four cascaded allpass phase rotation stages with wide binaural panning.',
      reader: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'XYZ' },
      writer: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'XYZ' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'granular', enabled: true, sampleRate: 44100, params: { size: 90, density: 16, pitchScatter: 7, posJitter: 80, mix: 0.75 } },
        { id: 'f2', type: 'fourbyfour', enabled: true, sampleRate: 44100, params: { f0: 120, f1: 1800, f2: 6500, f3: 14000, fb0: 0.5, fb1: -0.4, fb2: 0.35, fb3: -0.2 } },
        { id: 'f3', type: 'autopan', enabled: true, sampleRate: 44100, params: { freq: 1.8, depth: 80, gain: 1.2 } },
        { id: 'f4', type: 'limiter', enabled: true, sampleRate: 44100, params: { ceiling: -0.5, release: 80, drive: 2.0 } },
      ],
    },
  ];

  for (const preset of CURATED_PRESETS) {
    const record = new Record(presets);
    record.set('owner', user.id);
    record.set('name', preset.name);
    record.set('description', preset.description || '');
    record.set('payload', preset);
    record.set('schemaVersion', 1);
    record.set('visibility', 'public');
    record.set('authorName', user.getString('username') || 'vasily');
    record.set('isDefault', true);
    app.save(record);
  }
}, (app) => {
  try {
    app.db().newQuery('DELETE FROM presets WHERE isDefault = true').execute();
  } catch {}
});
