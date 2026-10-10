# REFACTORING & MODULARITY SPECIFICATION: SONIFICATION V2

**Document Version:** 1.0.0  
**Date:** 2026-10-10  
**Status:** Approved for Implementation  
**Primary Objective:** Eliminate monolith files (`src/style.css` > 3,200 lines, `src/main.ts` > 2,600 lines) by extracting clean, decoupled modules without breaking existing user flows, visual styling, or automated tests.

---

## 1. Baseline & Invariants

1. **Zero Behavioral Regressions**:
   - Audio sonification processing, video playback, camera input, offline rendering, and image drop must perform identically.
   - PocketBase authentication, cloud preset saving, and hash/QR preset sharing must function without state discrepancies.
   - All tests in `npm test` must continue passing (`regression.test.mjs`).
   - Production bundle `npm run build` must succeed at each step with valid TypeScript types.
2. **Visual & Design Integrity**:
   - The Analog Photographic Studio / Darkroom PCB Eurorack aesthetic, rotary knobs, CRT scope, HUD reticles, and mobile drawer styles must remain completely pixel-identical.

---

## 2. Target Directory & File Structure

```
SonificationV2/
├── SPECS.md                            # Specifications and modular architecture
├── index.html
├── src/
│   ├── main.ts                         # Thin coordinator (~250 lines)
│   ├── style.css                       # Clean imports bundle
│   ├── styles/                         # Modular stylesheets
│   │   ├── tokens.css                  # Color palette, variables, typography, resets
│   │   ├── layout.css                  # Main grid, header, footer, columns
│   │   ├── rack.css                    # Eurorack chassis, modules, cards, knobs
│   │   ├── viewport.css                # Monitor, transport bar, shutter/REC controls
│   │   ├── telemetry.css               # CRT scope bay, VU meters, monospace matrix
│   │   ├── modals.css                  # Filter library, account, QR, about modals
│   │   └── mobile.css                  # Mobile bottom bar, drawer, camera fullscreen
│   ├── ui/                             # Dedicated UI controllers
│   │   ├── qr-modal.ts                 # QR code generator and share dialog
│   │   ├── account-modal.ts            # PocketBase auth, legacy import, account dialog
│   │   ├── filter-library-modal.ts     # Filter browser, categories, search modal
│   │   ├── preset-controller.ts        # Preset selection, CRUD, seed/bus telemetry
│   │   ├── rack-controller.ts          # Module rack DOM, rotary knobs, bypass/delete
│   │   ├── mobile-controller.ts        # Mobile drawer, full-screen toggle, action buttons
│   │   └── media-controller.ts         # Image loading, video file loop, snapshots
│   ├── engine/                         # Existing DSP & pipeline (untouched)
│   ├── audio/                          # Sound camera audio (untouched)
│   ├── camera/                         # Camera manager (untouched)
│   ├── record/                         # Video recorders (untouched)
│   └── components/                     # Reusable components (HudOverlay, RotaryKnob)
```

---

## 3. Implementation Phases

### Phase 1: Modularize `src/style.css`
- Extract blocks into `src/styles/*.css`:
  - `tokens.css`: Root variables, themes, resets.
  - `layout.css`: Shell, header, footer, 2-column studio layout.
  - `rack.css`: Eurorack module styling, collapsible cards, input grid, sound module, knobs.
  - `viewport.css`: Monitor frame, transport controls, shutter/REC buttons, offline progress.
  - `telemetry.css`: CRT scope bay, VU meters, telemetry matrix.
  - `modals.css`: Filter library dialog, account dialog, QR modal, about modal.
  - `mobile.css`: Mobile bottom bar, full-screen camera mode, slide-out drawer, touch tweaks.
- Replace `src/style.css` with clean `@import` declarations.
- Verification: Validate live dev server styling and run `npm run build`.

---

### Phase 2: Extract Self-Contained UI Modal Controllers
1. **`src/ui/qr-modal.ts`**:
   - Encapsulates `#qr-modal`, `#qr-image`, share link copy, and QR rendering.
2. **`src/ui/account-modal.ts`**:
   - Encapsulates `#account-modal`, login/register toggling, account manager calls, legacy import, feedback banners.
3. **`src/ui/filter-library-modal.ts`**:
   - Encapsulates `#add-filter-modal`, category tab filters, text search, and dispatches filter additions to the rack.
- Verification: `npm run build` and `npm test`.

---

### Phase 3: Extract Media & Mobile Controllers
1. **`src/ui/media-controller.ts`**:
   - Image drag & drop, file picker, video file decoding loop, snapshot shutter flash, full-res download.
2. **`src/ui/mobile-controller.ts`**:
   - Mobile preset drawer toggle, badge updates, mobile action bar (camera flip, reticle toggle, audio unmute, shutter/rec).
- Verification: `npm run build` and `npm test`.

---

### Phase 4: Extract Filter Rack & Preset Controller
1. **`src/ui/rack-controller.ts`**:
   - Renders filter modules in the Eurorack container, instantiates `RotaryKnob`, handles parameter changes, re-ordering, bypass, and deletion.
2. **`src/ui/preset-controller.ts`**:
   - Manages preset dropdown, study index, seed badge, DAC bus rate selection, save/update/delete modal triggers, and cloud explore browser.
- Verification: `npm run build` and `npm test`.

---

### Phase 5: Final Coordinator Cleanup in `main.ts` & Validation
- Refactor `main.ts` into a lightweight orchestrator instantiating state, pipeline, camera, audio, and connecting UI controllers.
- Full validation with `npm test`, `npm run build`, and browser smoke testing.
