# Sonification V2

Browser studio and mobile camera for processing image pixels through audio DSP filters. Inputs include still images, video files, and a live camera. The studio includes a filter library, rotary controls, factory studies, custom presets, QR sharing, snapshots, and video recording.

The app has five local default presets. User accounts, private preset libraries, and public preset search use PocketBase. Presets are JSON records in PocketBase's SQLite database file on your VPS; each public link opens without login. Database persistence requires a VPS volume or disk that survives process restarts.

## Run locally

```powershell
npm ci
npm run dev
```

Download the matching PocketBase executable from [PocketBase releases](https://github.com/pocketbase/pocketbase/releases) and run it on the computer hosting Vite. It should listen on port 8090; Vite proxies `/api` and `/_/` to it. PocketBase applies the migration from `pb_migrations/` automatically. Local testing on a phone uses the computer's LAN address. For a VPS, use one public HTTPS origin; PocketBase serves the built app from `pb_public/` and its API from `/api/`.

Build the static app into the PocketBase web directory with:

```powershell
npm run build:backend
```

Keep `pb_data/` on persistent storage and outside Git. Back up the PocketBase data from its admin UI. Keep `pb_migrations/` and `pb_hooks/` with the deployment. The first run requires creating a PocketBase superuser through its setup page; this is an administrative account, separate from app user registration.

Open the HTTPS address printed by Vite. For a phone, use the computer's LAN address on the same network and port 5173. The development server uses a self-signed certificate; the browser may require accepting it before opening the camera. In the QR dialog, enter the computer's reachable LAN address when prompted.

Camera access requires a secure context. Production hosting must provide HTTPS. See [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

## Camera recovery

Switching cameras stops the old tracks, acquires the replacement stream, and restarts frame processing. Repeated taps during a switch are ignored. Acquisition and playback each have a 12-second timeout. A timed-out permission request can still be pending in the browser; any stream it returns later is stopped.

Leaving or hiding the page releases the camera. When returning, tap **START CAM** or **Live camera** to acquire it again. This makes recovery available inside the page. Permission denial, a disconnected device, or operating-system camera contention can still prevent startup.

Phone acceptance remains pending. Automated camera checks use mocked browser APIs, and local migration validation does not verify a VPS backup/restore or live two-account behavior.

## Verification

```powershell
npm test
npm run build
git diff --check
```

The existing regression checks cover camera request ownership, cancellation, playback failures and timeouts, callback cancellation, camera-switch render restart, dynamics history, factory-preset rendering, and edited factory-preset sharing. The build runs strict TypeScript checking and produces the Vite bundle in `dist`.

## Accounts and preset sharing

Registration uses a 3–32 character username and password. The PocketBase auth token remains in the browser's auth store and is configured to last up to 180 days. Signing out or clearing browser data removes it. There is no email-based password recovery; ask the PocketBase administrator to reset an account.

New saves are private. My presets loads only the signed-in user's records. **Share publicly** makes a saved preset searchable and creates a stable `#shared=` link that loads its latest saved revision. **Make private** removes it from search and disables that lookup. The QR modal's snapshot link contains the current preset parameters, needs no account, and remains usable by anyone who has the link. A snapshot QR that is too large can still be copied as text.

Guests can search Explore, open public links, and use all five Defaults. Saving or importing old browser-local presets needs login. Import copies them into the account and leaves the local data intact. Existing factory links remain resolvable.

If PocketBase is offline, camera use, defaults, and parameter snapshot links continue to work. Account sign-in, My presets, Explore, and shared-record QR lookup require the VPS.

## Recording

Real-time recording uses canvas capture and Web Audio through MediaRecorder. Codec support depends on the browser. Video-file export also has an offline WebCodecs path. Confirm that an exported recording contains moving video and audible audio on each target device.


## Project documents

- [GOAL.md](GOAL.md): product goals and performance targets.
- [PRD.md](PRD.md): product requirements.
- [SPECS.md](SPECS.md): original technical design.
- [REVIEW.md](REVIEW.md): implementation findings and verification limits.
- [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md): ordered follow-up work and acceptance criteria.
- [SPEC.md](SPEC.md): account, preset library, backend, and performance implementation requirements.

Performance figures in the goal and specification documents are targets. This review does not establish phone frame rates, 4K latency, or mathematical equivalence to the Processing implementation.
