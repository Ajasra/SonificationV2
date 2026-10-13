# Hierarchical affine scan experiment

## Motivation

The sustained application report `5b0bba0b` measured 59.3 ms median in the GPU completion/readback path after capture was accounted for separately. At 1280 × 720, the recurrence scan has 10,800 256-sample tiles. The prior implementation scanned all tile summaries with 14 dependent global compute passes for each of two filter stages.

## Change

For up to 256 blocks of tile summaries, the GPU now scans 256 tile summaries per workgroup, scans the resulting block totals in one workgroup, then applies the two-level prefix to samples. This uses two summary scan dispatches per stage instead of 14. The apply pass writes its recurrence prefix into the existing local buffer, so the large auxiliary scan output is no longer required on this path. Inputs requiring more than 256 summary blocks retain the previous general scan path.

The hierarchy keeps the affine composition order and previous-frame state in the GPU buffer. It does not change sample rate, filter parameters, capture mode, or fidelity limits.

## Verification

| Check | Result |
|---|---|
| `npm run build` | Passed |
| Focused Node tests | 9 passed |
| Chrome WebGPU fidelity/resident suite | 6 passed |
| Chrome application GPU integration suite | 2 passed |

The application integration test reports reference-byte capture on this local browser. Adapter identity is blank. These functional tests do not establish a frame-rate gain on the user's device. The next measurement should repeat the same source, 1280 × 720 TapeSat preset, active audio and HUD for at least 60 measured seconds, after restarting the server so report metadata reflects this change.
