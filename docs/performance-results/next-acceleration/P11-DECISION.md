# P11 — Segment planner decision

Status: **defer implementation and routing decisions**.

The proposal requires whole-route cost records for pure JS, supported WASM, contiguous GPU islands and fragmented CPU/GPU routes, plus tested state migration at boundaries. The evidence collected so far is a mixture of headless synthetic filter candidates and one GPU-specific application harness. The current app exposes only a narrow single-TapeSat GPU eligibility check; it does not have equivalent visible-app JS/WASM controls or a measured cost table for cross-backend racks.

The planner's selection rule was reviewed against existing constraints: only all-JS, all-supported-WASM and one contiguous GPU island with CPU prefix/suffix should initially be legal; unsupported formats, global blend/equalize, unverified audio-reactive transitions and missing costs must choose JS. No runnable candidate could be compared fairly against a planner because the required matched route measurements and state-migration contracts are absent. Assigning hypothetical costs would test the invented data, not the planner.

Decision: do not add an application planner or automatic calibration. Finish P00 equal app controls and collect at least three matched pairs per legal route class, including crossings, synchronization, startup, current rack/format/consumers and state handoff. Keep the current reference route and explicit backend override until the route matrix separates beyond observed variation.
