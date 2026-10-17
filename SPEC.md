# Reliability, performance, and user presets specification

Date: 2026-10-07
Baseline commit: `d18c8da`
Status: account and preset implementation is in place; VPS deployment and physical-device acceptance are pending.

## 1. Purpose and authority

For the next app-optimization implementation, follow [App optimization implementation SPEC](docs/APP_OPTIMIZATION_SPEC.md). It defines the current route architecture, sequential milestones and bounded test budget, superseding the execution order of the older performance proposals while preserving product invariants.

Make mobile camera switching, refresh, and recovery work without restarting the browser. Improve recording reliability and input validation, then reduce processing stalls using measured performance evidence.

Add simple username/password accounts for separate user preset libraries, persistent browser login, and a searchable shared-preset collection. Camera use and QR playback remain available without an account. Exactly five default presets are shown to everyone; other presets belong to their creators. This account requirement supersedes the original documents' account exclusion and browser-only custom-preset storage design.

This file defines the follow-up implementation contract derived from [REVIEW.md](REVIEW.md) and [IMPROVEMENT_PLAN.md](IMPROVEMENT_PLAN.md). [SPECS.md](SPECS.md) remains the original architecture reference. For this follow-up work, use this file when behavior differs from the original specification. Performance numbers in GOAL.md remain targets until measured.

Preserve existing image transformations, preset parameters, explicit resolution selection, and independent speaker mute/recording audio. Adaptive resolution and changes to artistic output require a separate decision.

## 2. Baseline and evidence

The baseline includes camera-switch render restart, callback cancellation, request generation checks, acquisition/playback timeouts, lifecycle camera release, dynamics history preservation, edited factory-preset sharing, and preset-text escaping.

Baseline evidence: 13 automated regression checks and the production build passed. Camera checks use mocked browser APIs. No physical-phone acceptance or performance baseline has been established.

## 3. Required invariants

1. One selected input owns the preview. Stale camera requests, file metadata callbacks, frame callbacks, and worker results cannot replace the current source.
2. Each active input has at most one frame-processing loop. Stop, source change, and page hiding cancel scheduled work and invalidate pending results.
3. Camera tracks returned after cancellation or timeout are stopped. Startup failures release acquired tracks and expose a retry action.
4. Hiding or leaving the page releases the camera. Returning requires an explicit start action; refresh must acquire a fresh stream.
5. Recorder-owned canvas video tracks are released after completion or failure. The recorder must preserve audio tracks owned by the shared audio engine.
6. Unchanged filter parameters preserve DSP history. Export uses a separate pipeline and cannot mutate live filter state.
7. Only validated presets reach UI rendering or DSP. Invalid input leaves the application in a usable state.
8. Live processing and audio queues have fixed bounds. Work cannot accumulate when processing falls behind capture.
9. Account checks never block a QR preset or camera startup. Signing in or out does not replace the applied preset or restart the camera.
10. User libraries contain only the current user's presets. Shared exploration is a separate, paginated view. Only the owner can change or delete a stored preset.

## 4. Implementation tasks

### T01: Camera and input recovery

Owner boundary: `src/camera/camera-manager.ts`, input handling and frame scheduling in `src/main.ts`, regression tests.

Retain the baseline camera lifecycle fixes. Extend source generation checks to uploaded-video metadata/playback callbacks. Ensure permission denial, ended tracks, startup timeout, and switch failure restore consistent desktop/mobile controls and a retry action. Show recoverable errors inside the page. Record diagnostic state sufficient to distinguish a stopped stream from blocked frame processing.

Acceptance:

- Automated checks cover cancellation during acquisition/playback, late stream delivery, repeated flip taps, source replacement, and stale file callbacks.
- On iOS Safari and Android Chrome, complete the REVIEW.md checklist, including 20 front/back switches, background/return, lock/unlock, and refresh.
- Controls remain usable and motion resumes without closing the browser. Record any device exception with model, OS, browser, preset, and resolution.

Status: baseline code fix implemented; further coverage and device acceptance pending.

### T02: Recording lifecycle and resource ownership

Owner boundary: `src/record/video-recorder.ts`, recording controls in `src/main.ts`, audio recording state, regression tests.

Implement explicit idle, starting, recording, and stopping states. Startup must return success or throw an actionable error. Update buttons, timers, and audio recording state only after successful startup; restore them on failure. Own canvas capture tracks and release them on constructor failure, start failure, recorder error, and completed stop. Concurrent stop calls must share one completion result and export once.

When the page becomes hidden, finalize an active real-time recording and retain its result for an explicit save action after return. Avoid automatic sharing from a background event. Camera switches during recording must preserve the recording canvas dimensions; rescale replacement-camera frames into that canvas until recording stops.

Acceptance: inject failures at each lifecycle boundary and assert track release, UI reset, and retry. Repeated recordings on each target phone contain moving video and audible audio. Background finalization produces a saveable result. Speaker mute does not remove recording audio.

Dependencies: T01 input ownership behavior.

### T03: Runtime preset validation

Owner boundary: preset manager, shared preset validator, import handlers, tests.

Apply one validator to URL hashes, local storage, and JSON imports. Validate required fields, stream enums, bit depths, known filter IDs, unique filter instance IDs, enabled flags, finite sample rates, descriptor parameter ranges, and blend settings. Reject unknown parameter names. Copy accepted input into an owned preset object. Accept existing valid factory/custom presets without migration.

Initial input limits: 256 KiB of decoded JSON, 64 filters, 128 characters for IDs/names, 4096 characters for descriptions, and filter sample rates between 8000 and 96000 Hz. Check encoded/file sizes before decoding or reading large inputs. Validate local-storage entries independently so one invalid entry does not discard valid neighbors. These limits are product guardrails and must be covered by boundary tests.

Acceptance: valid edited studies round-trip unchanged; malformed, oversized, unknown-filter, non-finite, and out-of-range inputs produce a recoverable error. Startup retains a valid default. Existing stored presets and factory studies pass validation.

Dependencies: none; complete before worker messaging accepts external preset data.

### T04: Reproducible performance baseline

Owner boundary: benchmark harness, optional profiling hooks in the pipeline, benchmark report.

Measure capture/draw/readback, color transforms, stream encode/decode, each filter, equalization, audio submission, and output drawing separately. Include total frame time. Use the same fixtures and preset parameters for comparisons, warm up before sampling, and keep profiling disabled during normal operation.

Run light and heavy presets at 360p, 480p, and 720p for live processing; measure 3840 × 2160 still-image processing separately. Report sample count, median/p95 latency, processed FPS, long tasks, and memory observations where supported. Record actual dimensions, device/browser, commit, and duration. Measure a five-minute phone run for sustained behavior.

Acceptance: commit a reproducible report identifying the largest costs. Missing device results remain explicitly pending. No optimization claims may rely solely on Node timings or the FPS badge.

Dependencies: T01; establish this baseline before T05/T06 performance claims.

### T05: Cache unchanged work and isolate exports

Owner boundary: pipeline filter synchronization, scope rendering, render scheduling, snapshot/offline export.

Cache parameter changes per filter instance so unchanged values skip setParams and coefficient recalculation. Preserve filter ordering, enable state, sample rate, and state-reset semantics. Reuse scope buffers and coalesce still-image render requests where profiling identifies waste. Give snapshots and offline exports their own pipeline instances.

Acceptance: deterministic output and DSP continuity match the baseline; unchanged frames do not reapply filter parameters. Export does not change the next live frame's state. Record before/after timings using T04 fixtures. Specify numeric tolerances before comparing results; preserve byte-exact image output where arithmetic is unchanged. Fix random seeds for stochastic fixtures.

Dependencies: T04.

### T06: Worker processing with bounded frame ownership

Owner boundary: pipeline worker, typed message protocol, input/output integration, export integration.

Move DSP and large export processing off the main thread. Keep filter state in the worker. Permit one in-flight live frame and at most one pending frame; replace pending input with the newest frame. Transfer buffers with explicit ownership and reuse them after return. Tag requests/results with source generation, preset revision, and dimensions. Discard stale results and reclaim their resources.

Keep export pipeline state separate and bound export concurrency to one job. Handle worker errors with a visible retry path. Select OffscreenCanvas only after measuring transfer/readback costs and checking the target browsers. Keep a documented compatibility path for unavailable capabilities.

Acceptance: bounded queues under overload, stale-result rejection after camera/preset changes, isolated export state, and no detached-buffer misuse. On target phones, report p95 latency and long-task changes against T04; controls remain responsive during heavy presets and 4K exports. Verify worker output against T05 fixtures.

Dependencies: T02, T03, T05.

### T07: Audio scheduling evaluation and implementation

Owner boundary: `src/audio/sound-camera.ts`, AudioWorklet and resampling code if justified, recording-audio integration.

Measure discontinuities in the current frame-triggered playback. Define how image samples and the selected bus rate map to device output samples. Evaluate a worklet queue capped at 100 ms of device-rate audio; drop oldest queued samples when full and fade to silence on underflow. Clear queued audio on source replacement and page hiding. Preserve independent monitor mute and recording audio.

Acceptance: report gaps/clicks and latency under varying frame rates before and after the change. Tests verify resampling, overflow, underflow, mute/record routing, and lifecycle reset. Recordings remain audible when monitoring is muted. Adopt the worklet path only with measured benefit and target-browser evidence.

Dependencies: T04 and the final frame delivery behavior from T06.

### T08: Sharing address and controller extraction

Owner boundary: QR/link generation and input, recording, and preset controllers extracted from `src/main.ts`.

Remove the fixed LAN address. Use the current HTTPS origin when reachable from the phone. For desktop localhost, require a validated host override before generating a phone link; preserve the application's path and preset hash. Reject invalid host input with an inline error. Extract controllers after lifecycle behavior is covered by tests.

Acceptance: generated links target the configured host and retain edited preset parameters. No development-specific address appears by default. Controller extraction passes existing lifecycle tests and a browser smoke test without changing UI behavior.

Dependencies: T01–T03 for controller extraction; address correction can proceed earlier.

### T09: Minimal shared backend

Owner boundary: backend setup, versioned collection migrations, preset validation hooks, integration tests, deployment documentation.

Use **PocketBase with SQLite and its official JavaScript SDK**. Keep the existing Vite/TypeScript frontend. Run one persistent backend process; no separate application API, external database, or realtime subscription layer is required for the initial group. PocketBase supplies the auth and record APIs. This choice assumes one small server or persistent host is available. Hosting provider/domain selection remains a deployment detail.

Serve the production Vite build from PocketBase's `pb_public` directory on the same HTTPS origin. Keep `pb_data` on persistent disk, outside Git, and use built-in backups. Commit migrations and required hooks. Pin the tested backend/SDK versions and document the upgrade procedure. During development, configure the API URL for a backend reachable from both the desktop and phone; never embed a privileged credential in the frontend.

Keep account handling to built-in password authentication and ownership rules. No email delivery, verification workflow, OAuth, MFA, billing, or custom authentication system is required. Password handling stays inside PocketBase. The application must still separate users' data correctly.

Collections:

| Collection | Fields and constraints |
| --- | --- |
| `users` (auth) | Required unique `username`, configured as the password-login identity; built-in password fields; email optional and unused in the initial UI. Normalize usernames to lowercase, allow 3–32 letters/digits/underscores, and keep usernames immutable initially. |
| `presets` | Required `owner` relation to `users`; `name`; optional `description`; required `payload` JSON containing the validated SonificationPreset; `schemaVersion = 1`; `visibility` enum `private` / `public` defaulting to `private`; read-only `authorName` copied from the owner's username; built-in ID/created/updated fields. |

Index owner/update time and visibility/update time. Use the PocketBase record ID as the saved preset identity; copies receive new IDs. Validate payloads using T03 constraints on both client and server, with shared parity fixtures. Require record name/description and payload metadata to agree. Assign owner/authorName on creation and prevent ownership changes. Do not accept client-supplied timestamps or author attribution.

Collection access behavior:

- Registration is available to guests. User account records are readable/updatable only by that user; public cards use `authorName` on presets rather than exposing user records. Account deletion can remain an administrator action initially.
- A preset is readable if public or owned by the current authenticated user. Guests cannot read private stored records.
- Preset creation requires login. Update/delete require ownership; public readers cannot overwrite another user's preset. Enforce these rules in backend collection rules/hooks, with integration tests using two accounts and a guest.

Acceptance: fresh migration produces usable username accounts and preset storage; data survives backend restart and backup/restore; two accounts cannot change or list each other's private presets; public records remain readable by guests. Defaults and inline QR presets still work while the backend is unavailable.

Dependencies: T03 validation contract. This track can proceed independently of performance work.

### T10: Registration and persistent optional login

Owner boundary: small account dialog, auth client/service, session state, desktop/mobile account button.

Add a **Log in** button with **Create account** and login views. Registration asks for username, password, and password confirmation; login asks for username/password. Use the backend's built-in password requirements. After registration, sign in and show **My presets** and **Log out**. Keep the active artwork and camera running through these actions. Initial password recovery is an administrator reset; no email service is needed.

Keep users signed in by default using the SDK's browser auth store. Configure a 180-day auth-token lifetime and refresh a still-valid token on application startup and before authenticated operations when its last refresh is older than 24 hours. Coalesce concurrent refreshes. Active use extends login; an expired token requires login again. Store the token/account state, never the password. Browser storage clearing or private-browsing restrictions may end persistence.

Restore/refresh authentication asynchronously so guest use starts immediately. On invalid/expired auth, clear account-specific UI/cache and offer login. On a network error, retain stored credentials and show that the library is temporarily unavailable; do not treat network failure as logout. Synchronize auth changes between tabs. Logout clears credentials and the displayed private library, while leaving the current applied artwork intact.

If Save is requested while logged out, open login and retain the unsaved preset. After successful login, return to the pending save action without losing edits. Ordinary QR opening never triggers this dialog.

Acceptance: account creation, duplicate-username errors, incorrect-password errors, logout, and expiry are recoverable. Refresh/reopen preserves a valid login. Network failure does not discard it. User switching never displays the previous account's private library. QR/camera startup runs before auth resolution.

Dependencies: T09.

### T11: Five defaults and private user libraries

Owner boundary: factory catalog selection, preset repository/manager, preset picker/drawer, save/update/delete UI, legacy import.

Expose exactly these five existing preset definitions as **Defaults**, keeping their current parameters and stable IDs:

| Default | Existing ID | Role |
| --- | --- | --- |
| Acid 303 Decay | `acid_303_decay` | Resonant synth effect |
| Vinyl 1987 Dust | `vinyl_1987_dust` | Texture and noise |
| Canyon Feedback Drift | `canyon_feedback_drift` | Delay and feedback |
| State-Variable Prism | `svf_morph_spectral` | Spectral filtering |
| Game Boy 4-Bit Crunch | `chiptune_gameboy_grit` | Bit reduction |

Bundle Defaults locally so startup does not depend on the backend. They are read-only; editing is allowed in the working state, and Save creates a user-owned copy. Do not seed the other factory definitions into a global visible library. Retain those definitions internally only to resolve old factory-ID links, and optionally offer explicit import as owned copies.

Separate the picker into **Defaults**, **My presets**, and **Explore**. Defaults are always present. My presets requires login and lists only that owner's records, newest updated first, with 24 records per page and name/description search. Fetch more on demand; never append all users' presets to the current dropdown. Save creates a private record, Update changes an owned record, and Delete removes an owned record after confirmation. Show save success only after the backend accepts the write. A failed save preserves the working preset and offers retry/export.

Applying someone else's public preset creates a working copy. **Save to my presets** creates a new private owned record; subsequent edits never modify the source. Track source identity separately from the working preset's saved identity. Editing a default follows the same copy behavior.

Preserve the existing browser-local custom-preset storage as a legacy source. After login, offer **Import presets from this browser** with a selectable preview; do not assign legacy data to whichever user happens to sign in. Validate before importing, preserve the original local data, and record successful imports per user/source so retry does not create duplicates. New account presets use the backend as their source of truth. Guest edits remain temporary, with JSON export available; no background sync queue is needed initially.

Acceptance: new guest sees five Defaults; new user sees five Defaults plus an empty My presets library. Users A and B each save presets and see separate libraries. Editing a default/shared preset creates a copy. Old local data and old factory links remain recoverable. Pagination and failed saves preserve usable controls and edits.

Dependencies: T03, T09, T10.

### T12: Guest QR playback and shared-preset exploration

Owner boundary: share controls, link/QR generation, guest preset resolution, Explore UI, paginated search.

Use one visibility switch: **Share publicly** makes an owned saved preset discoverable and gives it a stable `#shared=<record-id>` link/QR. **Make private** removes it from exploration and disables future guest lookup by that ID. Deleting a public record also disables that lookup. The public link loads the latest saved revision. Explain this beside sharing controls.

Retain self-contained `#p=` links for an exact current snapshot, including unsaved/guest/private working presets. Such a link carries preset data and can be opened by anyone holding it; it contains no account credential and cannot be revoked by changing visibility. It does not publish a searchable record. Use short default-ID links only for unchanged Defaults. If a snapshot is too large for a QR, offer the text link/JSON export or an explicitly published record link; do not silently publish a private preset.

Guest QR flow:

1. Resolve the hash before selecting a default. Fetch public record links without requiring an account; inline/default links resolve locally. Validate the result with T03.
2. Apply the resolved preset and enter the mobile camera view. Request camera access as soon as the browser permits; show the existing tap-to-start action if a gesture or permission is required.
3. Keep Log in available as an optional action for My presets. Auth restoration never replaces the QR-selected preset. Switching accounts also preserves it.
4. For a deleted/private/missing link or failed fetch, show a recoverable message and a retry action. Preserve the previously applied preset, or use the first Default at fresh startup. Do not redirect to login. Expire public fetches after five seconds and ignore results from superseded hashes.

Explore is available to guests and signed-in users. List only public records, newest updated first, with 24 cards per page. Cards show name, description, author, and Apply; signed-in users also have Save a copy. Search name, description, and author using a backend-filtered query with a 250 ms debounce. Escape search values through the SDK filter helper, bound query length to 128 characters, reset pagination on query changes, and discard stale responses. Show loading, empty, and unavailable states. Search/order indexes can be expanded only when measured dataset size warrants it; no external search service is required.

Account libraries and Explore do not download full preset payloads until needed where the API field selection permits. Avoid background library requests during frame processing; fetch on opening/searching the library. Preset network failure must not stop the camera.

Acceptance: on a logged-out phone, scan Default, snapshot, and public record QR codes and confirm the expected effect appears with no login dialog. Camera permission may still require a tap. Guest searches never return private records. Publish/unpublish/delete change discoverability correctly. User B can copy user A's public preset but cannot modify its source. Backend outage leaves locally resolvable QR links and Defaults usable.

Dependencies: T01, T03, T08 address behavior, T09–T11.

## 5. Delivery and completion rules

Implement focused task slices. Run relevant regression checks, `npm run build`, and `git diff --check`; update this file and the review with evidence before committing each completed slice. A passing build establishes compilation, not phone behavior or performance. Keep code completion, device acceptance, and measured optimization results separate in task status.

T01 device testing may wait for hardware while independent T02/T03 work proceeds. Preserve the T04 baseline before changing processing semantics. Record decisions and deviations in this file, including unsupported browser capabilities and revised limits.

Implement the account/preset track as T09 → T10 → T11 → T12 after establishing T03 validation. It can proceed alongside profiling and worker work. Keep its fetches and UI transitions outside camera ownership so account features cannot reintroduce the switch/recovery freeze. This specification update does not install, deploy, or create accounts yet.

The follow-up is complete when camera recovery and repeated recording pass the physical-device matrix, invalid presets are contained, export state is isolated, and performance/audio changes have documented acceptance evidence. Accounts must preserve login, separate private libraries, expose exactly five Defaults, and support guest QR playback and shared search. A deferred task requires an explicit disposition and remaining limitation.

### Current implementation status

- T09–T12 are implemented in the frontend, PocketBase migration/hooks, and deployment documentation. The implementation uses PocketBase's built-in `users` auth collection and SQLite-backed `presets` records; no separate application server or database is needed.
- The migration was applied successfully to a fresh PocketBase 0.28.1 database. `npm run build` and `git diff --check` are the code-level completion checks for this slice.
- Not yet established: deployment on the user's VPS, persistence across that VPS's restart/backup restore, two-account behavior against the deployed server, or physical-phone camera/QR acceptance. Treat those as deployment and device acceptance work, not as proven by the local build.
- The UI exposes five Defaults. Other factory definitions remain resolvable for existing links. Old browser-local presets can be imported after login; current working presets can be exported as JSON.

## 6. Backend references

Checked 2026-10-07. These document backend capabilities; token duration, visibility semantics, preset limits, and the five-default selection above are application decisions.

- [PocketBase introduction](https://pocketbase.io/docs/): SQLite backend, standalone executable, static hosting, data/migration directories.
- [Password authentication](https://pocketbase.io/docs/authentication/): unique username identity fields, auth refresh, logout behavior.
- [Official JavaScript SDK](https://github.com/pocketbase/js-sdk): browser auth store, tab synchronization, filtered record queries.
- [Collection rules](https://pocketbase.io/docs/api-rules-and-filters/): guest/owner record visibility and write rules.
- [Deployment and backups](https://pocketbase.io/docs/going-to-production/): persistent hosting, HTTPS, backup/restore.
