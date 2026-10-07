# Sonification V2

Browser studio and mobile camera for processing image pixels through audio DSP filters. Inputs include still images, video files, and a live camera. The studio includes a filter library, rotary controls, factory studies, custom presets, QR sharing, snapshots, and video recording.

## Run locally

```powershell
npm ci
npm run dev
```

Open the HTTPS address printed by Vite. For a phone, use the computer's LAN address on the same network and port 5173. The development server uses a self-signed certificate; the browser may require accepting it before opening the camera. The QR dialog's host must match the computer's actual LAN address. Its current default is a development-specific address.

Camera access requires a secure context. Production hosting must provide HTTPS. See [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## Camera recovery

Switching cameras stops the old tracks, acquires the replacement stream, and restarts frame processing. Repeated taps during a switch are ignored. Acquisition and playback each have a 12-second timeout. A timed-out permission request can still be pending in the browser; any stream it returns later is stopped.

Leaving or hiding the page releases the camera. When returning, tap **START CAM** or **Live camera** to acquire it again. This makes recovery available inside the page. Permission denial, a disconnected device, or operating-system camera contention can still prevent startup.

Phone acceptance remains pending. The automated camera tests use mocked browser APIs.

## Verification

```powershell
npm test
npm run build
git diff --check
```

Tests cover camera request ownership, cancellation, playback failures and timeouts, callback cancellation, camera-switch render restart, dynamics history, factory-preset rendering, and edited factory-preset sharing. The build runs strict TypeScript checking and produces the Vite bundle in `dist`.

## Recording and sharing

Real-time recording uses canvas capture and Web Audio through MediaRecorder. Codec support depends on the browser. Video-file export also has an offline WebCodecs path. Confirm that an exported recording contains moving video and audible audio on each target device.

An unchanged factory study uses a short ID link. An edited study carries its parameters in the URL hash. Custom presets are stored in this browser's local storage.

## Project documents

- [GOAL.md](GOAL.md): product goals and performance targets.
- [PRD.md](PRD.md): product requirements.
- [SPECS.md](SPECS.md): original technical design.
- [REVIEW.md](REVIEW.md): implementation findings and verification limits.
- [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md): ordered follow-up work and acceptance criteria.

Performance figures in the goal and specification documents are targets. This review does not establish phone frame rates, 4K latency, or mathematical equivalence to the Processing implementation.
