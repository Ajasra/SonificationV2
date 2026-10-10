# SONIFICATION V2 — UI AESTHETICS DESIGN PROTOCOL
**Document ID:** `DOC-UI-PROTO-01`  
**Classification:** Analog Telemetry, GD&T Instrumentation & Editorial CRT Design System  
**Status:** Approved Specification  
**Version:** 2.1.0  

---

## 1. Executive Summary & Aesthetic Manifesto

Sonification V2 merges visual media analysis with real-time audio DSP transduction. To reflect this scientific and artistic synthesis, the interface follows an **Editorial Analog Instrumentation & GD&T Telemetry** aesthetic.

Rather than a sterile, flat black-and-white UI, Sonification V2 achieves its identity through the contrast between:
1. **The Tactical Telemetry & GD&T Shell:** Monospace avionics headers, rigid 1px drafting grids, corner registration ticks (`┌ ┐ └ ┘`), bracketed controls (`[ PLAY ]`), and discrete segmented LED ladder meters.
2. **The Editorial Monograph Voice:** The distinguished `Cormorant Garamond` serif typeface for patch titles, study numbering, and poetic scientific descriptions.
3. **The Minimal Analog Palette:** Deep chassis charcoal blacks paired with warm cathode phosphor chartreuse, glowing amber/copper traces, muted sage graticules, bone-white text, and subtle optical chromatic aberration (RGB electron beam fringing).

---

## 2. Core Aesthetic Pillars

### Pillar I: Controlled Minimal Palette (Analog Cathode & Copper Traces)
The interface is anchored by deep void chassis tones (`#0c0f0c` to `#161b16`), but is vibrantly brought to life with a strictly curated four-color accent system:
- **Phosphor Chartreuse (`#c8d665`):** Cathode ray tube excitation, active study emphasis, resonant frequency spikes, and glowing live pips.
- **Warm Copper / Amber (`#d4a373` / `#c59b58`):** PCB traces, calibration datums, filament glow, and rotary dial indicators.
- **Muted Sage (`#9ea796`):** Oscilloscope graticule lines, secondary telemetry readouts, and unlit discrete meter segments.
- **Bone White (`#ece8dc`):** Organic, warm electron beam typography rather than harsh digital `#ffffff`.
- **Analog Red (`#d94b4b`):** Peak audio clipping and DSP boundary overload alerts.

### Pillar II: Dual-Typeface Harmony (Editorial Serif × Precision Monospace)
- **The Voice (Serif):** `Cormorant Garamond` carries the philosophical and humanistic weight of the instrument (preset titles like *Acid 303 Decay.*, patch numbers, field note headings). It features authentic analog chromatic aberration (cyan/amber electron beam mis-convergence).
- **The Engine (Monospace):** `JetBrains Mono` handles all parameter names, frequency readouts, hardware bus telemetry, GD&T feature control frames, and bracketed action buttons.

### Pillar III: Hairline Drafting Precision & GD&T Semiotics
Zero fuzzy drop-shadows or bloated neumorphic bevels. All panel divisions, module cards, and modal bays are formed by 1px monoline hairline borders (`#222921` to `#2e382d`). Controls are framed by dimension leader lines (`<— 44.1 kHz —>`), datum targets (`(ø01 / A1)`), and corner registration marks.

### Pillar IV: Segmented Discrete Metering
Continuous color gradients are prohibited for telemetry. All audio VU meters, buffer scrubbers, transfer rates, and progress displays operate as discrete stepped segments (`||||||||||||` or radial ticks) to communicate discrete digital sampling and hardware clocking.

---

## 3. Design Tokens & Palette Specification

```css
:root {
  /* Chassis Void & Enclosure (Deep Charcoal / Green-Black) */
  --bg-darkest: #0c0f0c;          /* Deepest screen void */
  --bg-dark: #121612;             /* Topbar & main frame chassis */
  --bg-surface: #161b16;          /* Module card surfaces & instrument bays */
  --bg-elevated: #1d231d;         /* Floating dialogs, modals, popovers */
  --bg-module: #151a15;           /* Inner module bays */

  /* Hairline Borders & PCB Traces */
  --border-subtle: #222921;       /* 1px structural grid dividers */
  --border-mid: #2e382d;          /* Interactive card borders */
  --border-bright: #435241;       /* Active / focused element borders */
  --border-copper: #8f7547;       /* PCB trace lines & calibrated datums */

  /* Typography */
  --text-primary: #ece8dc;        /* Warm Bone White (primary electron beam) */
  --text-secondary: #9ea796;      /* Muted Sage (secondary telemetry & descriptions) */
  --text-muted: #606a5b;          /* Technical Slate (inactive units, dimensions) */

  /* Curated Accent Palette */
  --accent-phosphor: #c8d665;     /* Warm Phosphor Chartreuse (active resonance) */
  --accent-phosphor-glow: rgba(200, 214, 101, 0.28);
  --accent-amber: #d4a373;        /* Warm Amber (dial highlights, patch seeds) */
  --accent-copper: #c59b58;       /* Silkscreen annotations & hardware labels */
  --accent-red: #d94b4b;          /* Analog Peak / Overload Warning */

  /* Typefaces */
  --font-serif: "Cormorant Garamond", "Newsreader", Garamond, Georgia, serif;
  --font-mono: "JetBrains Mono", "Space Mono", "SF Mono", Consolas, monospace;
}
```

---

## 4. Typography & Lettering Protocol

### 4.1 Editorial Serif Headings (Cormorant Garamond)
Used exclusively for:
- Hero patch title (e.g. `Acid 303 Decay.`, `Drawn by resonance.`)
- Large patch study numerals (`01`, `02`, `08`)
- Philosophy quotes, field notes, and modal feature titles.

#### Optical Chromatic Aberration & CRT Phosphor Glow
To replicate the electron beam fringing of authentic analog color monitors:

```css
.editorial-title {
  font-family: var(--font-serif);
  font-size: 1.75rem;
  font-weight: 400;
  line-height: 1.1;
  color: var(--text-primary);
  /* Chromatic aberration: subtle cyan beam offset on left, amber beam offset on right */
  text-shadow: 
    -1px 0 rgba(70, 190, 255, 0.40),
    1px 0 rgba(230, 130, 60, 0.40),
    0 0 6px var(--accent-phosphor-glow);
}

.editorial-title em {
  font-style: italic;
  font-weight: 300;
  color: var(--accent-phosphor);
  text-shadow: 
    -1px 0 rgba(70, 190, 255, 0.50),
    1px 0 rgba(230, 130, 60, 0.50),
    0 0 8px var(--accent-phosphor-glow);
}
```

### 4.2 Technical Monospace (JetBrains Mono)
Used for all operational UI:
- **Strict Uppercase:** All telemetry, buttons, module titles, and parameter labels.
- **Tracking:** `letter-spacing: 0.12em` to `0.20em` for headers and badges.
- **Tabular Figures:** Always apply `font-variant-numeric: tabular-nums` to prevent numerical jitter during live streaming.
- **Drafting & Schematic Symbols:** `[ ]`, `//`, `+`, `▲`, `▼`, `►`, `ø`, `⊕`, `⊞`.

---

## 5. Structural Framing & Spatial Grammar

```
    ┌────────────────────── [ 01 // DSP CORE ] ──────────────────────┐
    │  +                                                          +  │
    │     [ RES ] <----------- 84.2 % -----------> [ CUTOFF ]        │
    │                                                                │
    │     DATA SPECTRUM : [||||||||||||||||...........] 58%         │
    │  +                                                          +  │
    └────────────────────────────────────────────────────────────────┘
```

1. **Corner Registration Ticks:** Cards and modal dialogs feature 4-corner L-brackets (`┌ ┐ └ ┘`) or crosshair coordinates (`+`).
2. **Hairline Precision Grids:** Clean `1px solid var(--border-subtle)` partitioning.
3. **GD&T Feature Control Frames:**
   - Parameter values enclosed in dimension boxes: `[ RATIO: 4:1 ]`, `[ ATTACK: 12ms ]`.
   - Dimension arrows: `[ BUS A ] <---------------- 44.1 kHz ----------------> [ DAC 1 ]`.

---

## 6. Component Catalog & Implementation Specifications

### 6.1 Top Studio Ribbon (Avionics Header Bar)
- **Monogram:** `[ S / V2 ]` in `--accent-phosphor` with wide tracking.
- **Sub-Label:** `// AUDIO-VISUAL DATABENDING & SOUND CAMERA` in `--text-muted`.
- **Live Status Pip:** Glowing `--accent-phosphor` dot with `box-shadow: 0 0 6px var(--accent-phosphor)`.
- **Action Buttons:** Inset bracket triggers: `[ MY PRESETS ]`, `[ EXPLORE ]`, `[ PHONE ↗ ]`, `[ ABOUT ]`.

### 6.2 Bracket Action Buttons
Buttons feature crisp borders with bracket glyphs, transitioning to high-contrast inverted states or phosphor glows on hover:

```css
.btn-bracket {
  background: transparent;
  color: var(--text-primary);
  border: 1px solid var(--border-mid);
  padding: 4px 10px;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.10em;
  transition: all 0.12s ease;
  cursor: pointer;
  border-radius: 1px;
}

.btn-bracket::before { content: "[ "; color: var(--text-muted); }
.btn-bracket::after  { content: " ]"; color: var(--text-muted); }

.btn-bracket:hover {
  background: var(--bg-elevated);
  border-color: var(--accent-phosphor);
  color: var(--accent-phosphor);
  box-shadow: 0 0 8px var(--accent-phosphor-glow);
}
.btn-bracket:hover::before,
.btn-bracket:hover::after {
  color: var(--accent-phosphor);
}
```

### 6.3 Segmented VU Meters & Progress Bars
Meters use discrete phosphor LED steps rather than smooth gradients:

```
VU L: [||||||||||||||||||||............] -3.2 dB
VU R: [||||||||||||||||................] -6.8 dB
```

- **Active segments:** Solid `--accent-phosphor` with subtle phosphor bloom.
- **Peak warning segments:** `--accent-amber` and `--accent-red`.
- **Inactive segments:** Dim `--border-subtle` (`#222921`).

### 6.4 Rotary Knobs & Radial Tachometers
Rotary knobs feature:
- 1px hairline outer circumference with radial tick notches every 15° or 30°.
- Crisp indicator needle line pointing to the current parameter value.
- Parameter readouts in bone-white with units in muted sage (`2450 Hz`, `0.72 Q`).

### 6.5 Dedicated Split Viewport & Side CRT Telemetry Bay
To preserve video clarity over high-energy glitch and databent imagery, the viewport implements a dual-bay instrument console on desktop:
- **Primary Video Bay (`.canvas-frame`):** Dedicated unobstructed screen for the active databending artwork, framed by clean hairline corner reticles (`┌ ┐ └ ┘`).
- **Side CRT Telemetry Bay (`#telemetry-hud-bay`):** Dedicated deep-void cathode ray monitor chassis (`#060906`) housing:
  - **CRT Radar Reticle & Concentric Rings (Ref 1):** Optical calibration rings, millimeter graduation ticks, center crosshair, and live playhead sweep.
  - **Vector Oscilloscope & Particle Lattice (Ref 5):** Sharp 1px electron beam trace with authentic CRT phosphor persistence decay across 2–3 frames.
  - **Monospace Telemetry Matrix (Ref 2 & 4):** Live readouts for `SAMPLE BUS`, `PEAK LEVEL`, `SIGNAL RMS`, and `SCAN SEED`.
  - **Discrete Segmented LED VU Meters (Ref 2):** 20-segment discrete LED ladders for channels L and R with phosphor/amber/red step thresholds.
- **Dynamic Toggle:** When toggled off or on compact screens, the side bay collapses cleanly and the video monitor smoothly spans 100% width.

### 6.6 Modals & Dialog Matrices (Preset Browser, QR Modal, About)
Modals use rigid 1px partitioned instrument matrix grids:
- Clean header strip with silkscreen tag `[ PRESET REPOSITORY // DB REV 2.4 ]`.
- Preset cards showcasing the dual-typography: the title in `Cormorant Garamond` (e.g. *Hyper-Resonant Shimmer*) alongside monospace telemetry tags (`PATCH: 04`, `GENRE: GLITCH`, `FILTER: LADDER_24DB`).

---

## 7. Review & Verification Checklist

Before approving any UI modification under this protocol, confirm:
- [ ] Are patch and editorial titles rendered in `Cormorant Garamond` with optional italic accents and chromatic aberration?
- [ ] Are all controls, labels, and telemetry strictly in uppercase `JetBrains Mono` with tabular numbers?
- [ ] Does the color scheme adhere to the curated minimal palette (Charcoal, Bone White, Phosphor Chartreuse, Amber/Copper, Muted Sage)?
- [ ] Are continuous gradient meters replaced with discrete segmented LED ladders?
- [ ] Do buttons utilize bracketed framing (`[ ... ]`) and crisp hover transitions?
- [ ] Are all cards and panels framed by 1px hairline borders without soft fuzzy drop-shadows?
