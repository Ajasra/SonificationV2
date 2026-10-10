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
      id: 'master_tape_warmth',
      name: 'Master Tape Warmth',
      description: 'Studer A800 master tape saturation with organic wow & flutter drift, head-bump, and subtle analog compression.',
      reader: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      writer: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'tapesat', enabled: true, sampleRate: 44100, params: { drive: 2.2, bias: 0.08, bump: 0.35, bumpHz: 80, tone: 9500 } },
        { id: 'f2', type: 'tapewow', enabled: true, sampleRate: 44100, params: { wow: 0.25, flutter: 0.15, drift: 0.2, mix: 0.5 } },
        { id: 'f3', type: 'compressor', enabled: true, sampleRate: 44100, params: { threshold: -12, ratio: 2.5, attack: 25, release: 200, makeupGain: 1.5 } },
      ],
    },
    {
      id: 'liquid_acid_303',
      name: 'Liquid Acid 303',
      description: 'Resonant Roland TB-303 diode ladder sweeps tracing image contours with slapback delay.',
      reader: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      writer: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'vcf303', enabled: true, sampleRate: 44100, params: { cutoff: 0.55, resonance: 0.72, envMod: 0.5, decay: 1.1 } },
        { id: 'f2', type: 'echo', enabled: true, sampleRate: 44100, params: { delay: 0.08, decay: 0.35 } },
      ],
    },
    {
      id: 'canyon_echo_drift',
      name: 'Cathedral Canyon Echo',
      description: 'Spacious cross-coupled stereo echoes with lowpass filter trails and subtle reverberation.',
      reader: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LUV' },
      writer: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LUV' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'canyondelay', enabled: true, sampleRate: 44100, params: { ltrTime: 0.22, rtlTime: 0.34, ltrFeedback: 0.45, rtlFeedback: -0.3, cutoff: 2400 } },
        { id: 'f2', type: 'reverb', enabled: true, sampleRate: 44100, params: { delayMs: 350, decay: 0.4 } },
      ],
    },
    {
      id: 'humanoid_formant',
      name: 'Humanoid Formant Aura',
      description: 'Acoustic vocal tract resonance cavities (/A/-/E/-/I/) carving phonetic bands across luminosity and chrominance.',
      reader: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      writer: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'formant', enabled: true, sampleRate: 44100, params: { vowel: 1.2, resonance: 8.0, mix: 0.65 } },
        { id: 'f2', type: 'compressor', enabled: true, sampleRate: 44100, params: { threshold: -15, ratio: 3.5, attack: 15, release: 150, makeupGain: 2.0 } },
      ],
    },
    {
      id: 'cosmic_phase_shimmer',
      name: 'Cosmic Phase Shimmer',
      description: 'Four-stage allpass phase rotation with microsecond flanger modulation creating pearlescent chromatic diffraction.',
      reader: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'XYZ' },
      writer: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'XYZ' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'fourbyfour', enabled: true, sampleRate: 44100, params: { f0: 100, f1: 1500, f2: 5500, f3: 12000, fb0: 0.35, fb1: -0.25, fb2: 0.2, fb3: -0.15 } },
        { id: 'f2', type: 'flanger', enabled: true, sampleRate: 44100, params: { rate: 0.2, depth: 3.0, feedback: 0.45, delayMs: 3.0, mix: 0.35 } },
      ],
    },
    {
      id: 'harmonic_sitar_strings',
      name: 'Harmonic Sitar Strings',
      description: 'Four tuned Karplus sympathetic strings ringing harmonically along edge contours through stereo canyon delay.',
      reader: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      writer: { rawType: 'PLANAR', law: 'A_LAW', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'LAB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'resbank', enabled: true, sampleRate: 44100, params: { root: 146.8, spread: 5, decay: 0.92, damping: 0.4, mix: 0.5 } },
        { id: 'f2', type: 'canyondelay', enabled: true, sampleRate: 44100, params: { ltrTime: 0.18, rtlTime: 0.26, ltrFeedback: 0.35, rtlFeedback: -0.25, cutoff: 3200 } },
      ],
    },
    {
      id: 'westcoast_solarization',
      name: 'West-Coast Solarization',
      description: 'Subtle Buchla-style wavefolding turning highlights into complementary pastel solarized hues while keeping shadows deep.',
      reader: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'HCL' },
      writer: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'HCL' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'wavefolder', enabled: true, sampleRate: 44100, params: { drive: 2.2, folds: 2, symmetry: -0.1 },
        },
        { id: 'f2', type: 'djeq', enabled: true, sampleRate: 44100, params: { lo: 3, mid: -1, hi: 4, peakBw: 0.5, shelfSlope: 1.2 } },
      ],
    },
    {
      id: 'impressionist_grain',
      name: 'Impressionistic Grain Cloud',
      description: 'Micro-grain re-synthesis blended under tape saturation creating painterly 35mm film grain texture.',
      reader: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'XYZ' },
      writer: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 16, endianess: 'LITTLE_ENDIAN', colorSpace: 'XYZ' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'granular', enabled: true, sampleRate: 44100, params: { size: 60, density: 18, pitchScatter: 2.5, posJitter: 50, mix: 0.35 } },
        { id: 'f2', type: 'tapesat', enabled: true, sampleRate: 44100, params: { drive: 2.5, bias: 0.05, bump: 0.3, bumpHz: 90, tone: 8000 } },
      ],
    },
    {
      id: 'spectral_prism_svf',
      name: 'State-Variable Spectral Prism',
      description: 'Smooth continuous morphing between lowpass warmth and highpass edge extraction with ambient delay.',
      reader: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'XYZ' },
      writer: { rawType: 'PLANAR', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'XYZ' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'svf', enabled: true, sampleRate: 44100, params: { cutoff: 2400, res: 3.0, mode: 1.2 } },
        { id: 'f2', type: 'echo', enabled: true, sampleRate: 44100, params: { delay: 0.12, decay: 0.4 } },
        { id: 'f3', type: 'limiter', enabled: true, sampleRate: 44100, params: { ceiling: -0.5, release: 60, drive: 1.0 } },
      ],
    },
    {
      id: 'vintage_vinyl_1978',
      name: 'Vintage Vinyl 1978',
      description: 'Subtle 33 RPM turntable motor warp, gentle groove friction, and warm analog equalization.',
      reader: { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' },
      writer: { rawType: 'INTERLEAVED', law: 'NONE', sign: 'UNSIGNED', bits: 8, endianess: 'LITTLE_ENDIAN', colorSpace: 'RGB' },
      equalize: true, blendMode: 'NONE', blendAmount: 0,
      filters: [
        { id: 'f1', type: 'vynil', enabled: true, sampleRate: 44100, params: { year: 1978, rpm: 33, warp: 0.2, click: 0.15, wear: 0.35 } },
        { id: 'f2', type: 'basstreble', enabled: true, sampleRate: 44100, params: { dBBass: 4.0, dBTreble: -2.5, hzBass: 150, hzTreble: 6000 } },
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
