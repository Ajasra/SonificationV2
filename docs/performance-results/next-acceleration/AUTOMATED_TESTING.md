# Local acceleration test automation

Run `npm run test:acceleration` from the repository root to execute the local gates serially and write an immutable run report plus `automated-runs/latest.json`.

The default run executes all `tests/*.test.mjs`, WASM conformance, production and benchmark builds, benchmark/report and worker browser tests, the app-GPU integration tests, all WebGPU kernel/temporal tests, and monitor/state handoff. GPU browser tests use the installed Chrome channel and are split into separate Playwright processes to release the device between groups. Failed and timed-out groups do not prevent later local gates from running; any such group makes the overall command fail.

Each report records the source revision, whether the tree was clean at run start, host/OS details, every command, exit code, duration, and skipped/failed groups. Generated reports are kept locally under the ignored `automated-runs/` directory so they do not make later build-provenance checks appear dirty. Copy a report into a versioned proposal folder when it is intended as durable experiment evidence.

Use `npm run test:acceleration -- --skip-gpu` only when Chrome WebGPU is unavailable or GPU access is reserved. It skips the three GPU browser groups and records that choice in the report. GPU test timeouts are bounded so a wedged browser cannot produce a false pass.

These automated desktop gates do not claim the external acceptance work: visible 30 fps testing with audible output, named Android/iPhone devices, camera and 300-second sessions, offline MP4 fidelity/abort/history isolation, or deployed HTTPS/worker/WASM/cache/fallback checks. Record device identity and power/thermal conditions for any manual cohort; the browser API does not reliably identify physical hardware.
