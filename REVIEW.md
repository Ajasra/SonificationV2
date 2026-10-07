# Implementation review: 2026-10-07

## Assessment

The implementation includes the desktop rack, mobile viewfinder, expanded DSP library and factory studies, live audio, QR links, snapshots, real-time recording, and offline video export. The typed-array pipeline reuses working buffers and filter instances. These are useful foundations for further performance work.

Mobile reliability needs further acceptance testing. The current performance goals also need measured evidence. Review scope covered the working-tree changes and adjacent camera, pipeline, audio, preset, and recording code; it was not a complete mathematical audit of every filter or color transform.

## Fixed in this revision

| Finding | Cause | Change |
| --- | --- | --- |
| Camera switch can freeze the preview | The frame callback exits while the camera is stopped; flip handlers never restart it | Both flip controls use one guarded switch handler that cancels the old loop and restarts rendering |
| Old callbacks can survive an input change | Video-frame callback IDs were never stored or cancelled | Track and cancel both video and animation callbacks; reject stale loop generations |
| Multiple camera requests can overlap | Auto-start and user controls can request acquisition concurrently | Share pending manager starts and guard application camera transitions |
| Late camera requests can reacquire hardware after stop | Pending acquisition had no ownership check | Stop late streams when their request generation has expired |
| Startup failures retain resources or block retry | Playback failure lacked cleanup; acquisition and playback could remain pending | Detach the video, stop tracks on failure, and bound each wait to 12 seconds |
| Page navigation can leave camera resources active | No page lifecycle cleanup | Release the camera on pagehide and when hidden; provide a start action on return |
| Dynamics filters lose envelope continuity | Per-frame parameter updates called init and reset history | Preserve compressor envelope and gate envelope/gain while recalculating coefficients |
| Shared edited factory studies revert to defaults | QR/hash encoding checked only the factory ID | Use a short ID only when the complete preset equals the factory preset |
| Preset text can be interpreted as HTML | Names and descriptions were interpolated into innerHTML | Escape preset text in the editorial title and mobile preset drawer |
| Uploaded video URLs accumulate | Stopped video files retained their object URLs | Revoke the URL when releasing the video |

The camera release approach follows [MDN getUserMedia guidance](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia). Callback cancellation uses the [video-frame cancellation API](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/cancelVideoFrameCallback).

## Open findings

| Priority | Finding | Consequence |
| --- | --- | --- |
| P1 | DSP, canvas readback, and full-resolution snapshot processing run on the main thread | Heavy presets or large images can block touch input and look like a frozen browser |
| P1 | Recorder startup can return after failure while the UI starts its timer; capture tracks have no explicit cleanup owner | Recording state can disagree with actual capture; repeated recording may retain resources |
| P1 | Presets decoded from hashes or local storage are cast to TypeScript types without runtime validation | Malformed formats, unknown filters, or non-finite parameters can break startup or processing |
| P2 | Audio playback stops and replaces a 4096-sample source on each video frame | Continuity and timing depend on frame cadence; slow processing can cause audible gaps |
| P2 | Filter parameters are reapplied every frame, including coefficient recalculation | Unchanged presets perform avoidable work |
| P2 | Snapshot and offline export share the live pipeline's mutable DSP state | Export can alter the subsequent live image/audio history |
| P2 | The mobile share host defaults to a fixed LAN address | Links can point to the wrong computer |

## Verification obtained

- `npm test`: 13 tests passed. Includes three small frames through every factory study with finite-sample assertions.
- `npm run build`: strict TypeScript checking and production bundling passed.
- `git diff --check`: passed after removing trailing blank space.

The tests transpile TypeScript with the installed compiler and execute it in a Node VM. Camera and render lifecycle checks use mocked APIs; the pipeline and DSP assertions execute the actual implementation. They do not establish device compatibility, codec behavior, visual layout, or performance targets.

## Phone acceptance checklist

Record the phone model, operating system, browser version, preset, and processing resolution with results.

1. Start the rear camera over HTTPS, switch front/back 20 times, and confirm continuing motion after every switch.
2. Tap flip repeatedly during a switch. Confirm one transition completes and the page remains responsive.
3. Hide the tab, switch applications, lock/unlock the phone, and return. Tap START CAM and confirm motion resumes.
4. Refresh with the camera running and reopen the same tab. Confirm camera access works without closing the browser.
5. Deny permission and retry after granting it. Confirm a visible error and a usable start control.
6. Alternate camera, uploaded video, and still image. Confirm only the selected source drives the viewfinder.
7. Record, stop, and record again; inspect downloaded video and audio. Repeat while switching cameras and when returning after backgrounding.
8. Run a heavy preset at 360p, 480p, and 720p for five minutes; note processing time, responsiveness, and heat.

Use iOS Safari and Android Chrome for initial acceptance. Until these checks pass, the phone freeze is a code-level fix with device verification pending. The reported need to close the browser may also involve main-thread stalls or browser camera behavior.
