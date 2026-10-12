# Sparse capture mismatch and byte-preserving fallback

Original pasted diagnostic is preserved unchanged as capture-mismatch-52a7e061.txt. Revision 36e1dee, dirty true, same MP4 hash, adapter strings unavailable. Sample-only tests passed. Resident texture capture differed from reference by one RGB byte in 280 synthetic samples and 248 source samples; maximum filtered error was approximately 0.0134. Compact repeated-byte errors were <=8.941e-7, inside the existing gate. Pixel errors were two byte levels, so timing correctly remained blocked.

## Interpretation

The error is at the canvas-readback/texture-capture boundary. Sparse differences even in the synthetic byte fixture distinguish this from general filter numerical precision. Browser or extension modifications to canvas readback are one possible explanation; the report alone does not establish the exact browser or cause. [Brave documents canvas output randomization](https://brave.com/privacy-updates/4-fingerprinting-defenses-2.0/) and [de-identification of GPU information](https://brave.com/privacy-updates/38-webgl-webgpu-fingerprinting-protections/). These sources support that possibility, not identification of the user's browser.

## Implementation

1. Run the existing texture fidelity probe.
2. If capture samples differ at all, preserve that probe and select reference-bytes mode.
3. In preflight, feed the exact same captured RGBA array to CPU reference serialization and GPU byte unpacking. During measurement, read the reference canvas once and upload that byte array. The GPU unpacks RGB, applies TapeSat, renders and gathers compact samples.
4. Rerun all existing sample/pixel/gather gates and block timing if any still fail.

This preserves reference data, including any browser modifications already applied to it, without changing browser settings. It adds full RGBA canvas readback/upload (3,686,400 bytes/frame at 720p), while avoiding CPU Float32 serialization and full Float32 sample readback (11,059,200 bytes). Snapshot, raster/readback, upload and GPU completion stay inside measured elapsed time. The existing f32 and pixel tolerances are unchanged; raw captured samples must still match exactly.

## Verification scope

Real installed-Chrome GPU tests simulate a one-byte change in getImageData. The original texture probe fails, automatic fallback selects reference-bytes, and the unchanged gate passes. Tests also exercise decoded-video benchmark completion in both normal and altered-readback modes. These validate the fallback on the local AMD adapter; the user's MP4/adapter and 60-second performance remain open.

Saved decoded-video fallback report: synthetic-amd-byte-fallback-e40919a1-3c6e-420f-bd37-f3faa8274927.json, extracted unchanged from the Playwright attachment. It records the failed texture probe, selected reference-bytes capture and passing final fidelity, followed by a completed approximately one-second measurement. This is functional evidence with injected readback alteration, not a 720p30 acceptance result or a comparison with the user's source.
