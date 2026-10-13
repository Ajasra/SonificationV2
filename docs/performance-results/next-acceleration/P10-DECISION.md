# P10 — GPU TapeWow decision

Status: **reject the current shader prototype; no application route**.

## Test

The first GPU implementation modeled TapeWow's delay ring, oscillator phases, seeded control random stream and persistent state in a WebGPU compute shader. A headless Chrome / AMD GCN-5 run compared the GPU against `TapeWowFilter` at 44.1 kHz for three continuous blocks (2,764,800 samples total), with `wow=.5`, `flutter=.3`, `drift=.3`, `mix=1`, seed 4821. A 4,096-sample dry-pass identity check tested the upload/dispatch/readback path independently. The test ran with the same seeded fixture on both paths.

Command: `BENCHMARK_GPU_BROWSER=chrome npx playwright test tests/browser/webgpu.spec.ts --grep "TapeWow GPU recurrence"` (PowerShell equivalent used `$env:BENCHMARK_GPU_BROWSER='chrome'`).

## Result

The identity check's maximum error was 1.0. On the wet path, maximum absolute error was 1.999994 and RMS error was 0.721287 across 2,764,800 samples. The first mismatch was frame 0, sample 1357 (`expected=-1.546056`, `actual=0`). Fidelity failed decisively, so the timing is diagnostic only: CPU p95 27.2 ms; GPU upload/dispatch/map path p95 12.5 ms over three blocks. It does not demonstrate an acceleration win.

## Decision and next step

Do not keep or integrate this candidate. The storage-buffer parameter layout correction did not resolve the identity failure. The failure is not yet localized to shader execution, resource binding or readback, so no claim is made about the viability of GPU TapeWow. If revisited, begin with a one-workgroup copy shader and GPU error-scope/device-loss reporting, then add ring state in small steps. Use audio-sized production blocks, test exact recurrence and random-control ownership, and only then benchmark TapeWow alone and the contiguous TapeSat→TapeWow segment. Production `Math.random` ownership remains a separate unresolved contract.
