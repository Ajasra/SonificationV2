# P03 — Monitoring and HUD decision

Status: **keep the HUD and existing compact monitor packet; no cadence or packet change justified yet.** The six-run 60-second headless cohort isolated HUD on/off while audio remained active, dispatch was unfused, validation was on, and source/device were unchanged. All runs passed fidelity. Raw reports sit beside this decision.

| Pair | HUD on fps / frame p95 | HUD off fps / frame p95 |
|---|---:|---:|
| 1 | 51.57 / 15.9 ms | 54.67 / 20.3 ms |
| 2 | 52.32 / 18.0 ms | 54.39 / 20.7 ms |
| 3 | 52.59 / 16.3 ms | 57.27 / 14.7 ms |

HUD-off averaged 55.44 fps versus 52.16 with HUD on (about 6% higher), while median frame p95 was 20.3 ms off and 16.3 ms on. The average-throughput improvement is plausible, but the p95/long-tail results do not show consistent benefit and all runs remain under the 25 ms p95 budget. HUD rendering timing p95 while enabled was 4.6–7.2 ms; this diagnostic interval may overlap other frame work and must not be added to other percentiles. The disabled case correctly reports zero HUD draws.

This test toggles overlay drawing only. It does not disable the GPU's 8,194-float (32,776-byte) compact packet, playback gather, scope/raw preview, DOM meter, or TapeSat state transfer. We did not test demand-driven packet composition, consumer-specific gather correctness, HUD cadence, input responsiveness, or camera/audio-reactive racks. Keep all active consumers and the current default HUD until a bounded packet prototype passes exact index/state fixtures and its own paired app test.

## Conditions and limitations

Revision `f7f54e3be90775453e6ee3aa47f05633db5bd6b8`; `test_60fps.mov`, 1280x720 60 fps, source hash `d86a2c31d29b1e175d4ddf165b1107809b50c60e2b40f0b8c5dadaca87da77e7`, AMD GCN-5/headless Chrome, profile off, audio active at 0.25, per-frame validation on, fused dispatch off. Reports say the tree was dirty even though checkout status was clean. This is a 60 fps stress cohort, not visible-browser or 30 fps acceptance.
