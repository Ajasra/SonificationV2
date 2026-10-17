# App optimization fixtures

`R2.json` is the frozen ordered Procamp -> Solarizer -> Colorizer workload. It uses the existing descriptor defaults and explicit unique instance IDs. The empty audio rack invokes the reference pipeline's implicit identity audio stage.

`R3.json` is the frozen TapeSat -> Procamp -> Solarizer -> Colorizer workload. It shares the R2 video parameters, adds the benchmark TapeSat defaults and uses the explicit mixed chain order from the M2 screen workload.

`V01-cvislicer.json` extends R2 with the default CVI Slicer as its final video node. SHA-256: `33a24d115e672c6a74c2500b736b2d058232a95bde1f1d8e945784a099862100`.

`V02-crtbloom.json` extends R2 with default CRT Bloom as its final video node. SHA-256: `ddb9bd0e5dc01171e0e0b248f963b9939149b9f2260ce54979a3757cf27492ff`. The experimental GPU candidate failed full-app byte parity and is excluded from GPU routing; use this fixture only for CPU reference checks.

`V03-rftuner.json` extends R2 with default RF Tuner as its final video node for CPU-path profiling. SHA-256: `aa89bd89c9659831e5169ff8b1a30bd8654c7308e03048f680cf595278dc88a1`.

`V04-syncglitch.json` extends R2 with default Sync Glitch as its final video node for CPU-path profiling. SHA-256: `eb97e303100b8120746941f6e558a872ba0e248c29a81d923dff7dc74cc583bf`.

`V05-differentiator.json` extends R2 with default Differentiator as its final video node. SHA-256: `6f82d41950f139e2f4a6c7bf5bfc2de1a20ae5376e5b01594053a016793f9fd2`. Its optional shared GPU-tail candidate passed byte parity and the bounded screen benefit gate; it remains experimental because no acceptance cohort remains under the parent app SPEC.

`V06-scanimate.json` extends R2 with default Scanimate as its final video node. SHA-256: `38850cef68d4da09376f2116f68d21a6c1642c01f64e6fcdbaf73006f731f6dd`. The attempted GPU candidate failed byte parity and is excluded from GPU routing.

`V07-ruttetra.json` extends R2 with default Rutt-Etra as its final video node. SHA-256: `8e8f3aad78ce76a83b72cbe2df88f2e1117bd701d402d3045fb8808857c6e678`. CPU-only app/control profiles are diagnostic; no candidate route was tested.

`V08-vidicon.json` extends R2 with default Vidicon as its final video node. SHA-256: `7eadbbbd2410d763b83d1cf647c89883d058b5c7ec0392c2726d2b13b6a3ed35`. The standalone prototype passed its temporal diagnostic but is slower serially than the CPU filter and is not app-route eligible.

`V09-feedback.json` extends R2 with default Feedback as its final video node. SHA-256: `64c69280c98566cbdd8862c4cdabf64150c98f5d389f4c0fa9442422b42982c8`. CPU-path profile only; stateful GPU route deferred.

`V10-framedelay.json` extends R2 with default Frame Delay as its final video node. SHA-256: `f5e0b9d29e26431a58376436d13d5707347fc2070601dce1b6a2917f244cf7fa`. CPU-path profile only; GPU ring deferred pending bounded state ownership.

`V11-chromasmear.json` extends R2 with default Chroma Smear as its final video node. SHA-256: `3cbd47050e26b4093303148db960ea6df74bc2758af3532a58f62bc918226274`. CPU-path profile only; exact shared GPU route deferred.

`A01-djeq.json` contains the default DjEQ as its audio rack for A01 CPU-path profiling. SHA-256: `ba962fe2e94392ddda6b5c79283d5ba1e46e23d9f59af2bb854d23b1334e150e`.

`A02-basstreble.json` contains the default Bass & Treble filter as its audio rack for A02 CPU-path profiling. SHA-256: `74758cd84560031fee86f211f93c73d27f23d1960d37dc68a2d0317f96b23a7d`.

`A03-reson.json` contains the default Reson filter as its audio rack for A03 CPU-path profiling. SHA-256: `40e5f8b65a45ee96a1ee68335f0ef050711cc9982104e5a4ff5f16b75027cea3`.

`A04-moogladder.json` contains the default Moogladder filter as its audio rack for A04 CPU/WASM profiling. SHA-256: `4ebd7a19fd1d703a22f961ba2fe28d19dc23044111b272e6a959b6c2ce9096a4`.

`A05-svf.json` contains the default SVF filter as its audio rack for A05 CPU-path profiling. SHA-256: `c5b9dd41a340a992f4a52df6a16fdf37b83adf6e8075cbaf3d4aabff57514b8b`.

`A06-formant.json` contains the default Formant filter as its audio rack for A06 CPU-path profiling. SHA-256: `3aa066cdf5ac4ed4802f246de23b4f70193378ae8b32b231a749629f9422f38b`.

`A07-comb.json` contains the default Comb filter as its audio rack for A07 CPU-path profiling. SHA-256: `a79d671bf15fa871000cee4ad07d7cd966ba5c7c9bb82bcf5612f7c538c6e2bf`.

`A08-echo.json` contains the default Echo filter as its audio rack for A08 CPU-path profiling. SHA-256: `2a2528f00b32da4644a550cb0b8b835153bf71043f6c98ab0711a3736da882d8`.

`A09-canyondelay.json` contains the default Canyon Delay filter as its audio rack for A09 CPU-path profiling. SHA-256: `f758dbe1f9d7e974ab8ac06bf01d76d8dcf23a47871256bccb807fd4a01d4f45`.

`A10-reverb.json` contains the default Reverb filter as its audio rack for A10 CPU-path profiling. SHA-256: `d3df1be3a9925ccfb463525b03edb2b6c8250c1cf156801c42a30e308e24d50d`.

`A11-phaser.json` contains the default Phaser filter as its audio rack for A11 CPU-path profiling. SHA-256: `dcad2ff5af2f892dd53cb2013b5dab62f797babdd14cb09f081ad7864b4753af`.

`A12-wahwah.json` contains the default Wahwah filter as its audio rack for A12 CPU-path profiling. SHA-256: `cf780f7838e528a46350d9e9e62e83a8862303136e28db874a1e21cfdf210cf7`.

`A13-lfophaser.json` contains the default LFO Phaser filter as its audio rack for A13 CPU-path profiling. SHA-256: `973486730551798d7ddcfb9511c5c756e3edb39f973d83bd64d0a0a0820ccc58`.

`A14-fourbyfour.json` contains default Four By Four as its audio rack for A14 CPU-path profiling. SHA-256: `cfacd5f4d76d34e7c5de15216950b5541f212328126ecb58f0384256c7f4113c`. The unrolled CPU implementation passed exact sample/state parity and remains alongside its reference method. Results: `docs/performance-results/app-optimization/A14-fourbyfour-cpu-unroll.json`.

`A15-autophaser.json` contains the default Autophaser filter as its audio rack for A15 CPU-path profiling. SHA-256: `5ff0c0cfe5482224b9d108e9b0e1bb1de115effd8b509555f2c7140be9cc57fd`.

`A16-autopan.json` contains the default Autopan filter as its audio rack for A16 CPU-path profiling. SHA-256: `98491da69f51e1b0ee259f1088bf38b15d8831cbee226bfe4ce913e2841787c0`.

`A17-ringmod.json` contains the default Ring Mod filter as its audio rack for A17 CPU-path profiling. SHA-256: `6335e0c934113af95c980050330b6cde8fad209973cf750ae391b9b8dcc30392`.

`A18-flanger.json` contains the default Flanger filter as its audio rack for A18 CPU-path profiling. SHA-256: `0b8410dc5e6c3308d83e7af31b2bcb8393ba523d36dcd666c793f7a4145994fb`.

`A19-tremolo.json` contains the default Tremolo filter as its audio rack for A19 CPU-path profiling. SHA-256: `f1749ad35f6bbd4de613f45d725ec51bf7616dbefbc2de7e2ba9f87c0aacf9cd`.

`A20-vcf303.json` contains the default VCF303 filter as its audio rack for A20 CPU-path profiling. SHA-256: `9b2505fae1445d4f967eb4956164b35639093d36c5fa4ad4cb25460f46a07ef7`.

`A21-plucked.json` contains the default Plucked filter as its audio rack for A21 CPU-path profiling. SHA-256: `a76940aac767fed60a258a2f3fe124c7e090d40508d3c994a6998d6e2af576d8`.

`A22-fmop.json` contains the default FM Operator filter as its audio rack for A22 CPU-path profiling. SHA-256: `3a2037bedbda9a210fb5b8fc879bd401fdf98af9cfd1e2f94561ecdfaccad64b`. An interpolated sine-table candidate exceeded high-feedback audio tolerance and benchmarked slower than `Math.sin`; candidate code was removed.

`A23-drone.json` contains the default Drone filter as its audio rack for A23 CPU-path profiling. SHA-256: `63c4d529dc95738a3c35c9316c1018962a9d944e55a6535108b52392e270fef9`.

`A24-pitchshift.json` contains the default Pitchshift filter as its audio rack for A24 CPU-path profiling. SHA-256: `208f749df6fa89aa558a0a41c400651adac76824f8bf4af776f61abe661beefa`. Exact one-wrap optimization results: `docs/performance-results/app-optimization/A24-pitchshift-cpu-wrap.json`.

`source-720p30.mp4` is a deterministic 20-second derivative of the repository's `test_60fps.mov` source. It was created with:

```powershell
ffmpeg -y -i test_60fps.mov -t 20 -vf fps=30 -an -c:v libx264 -preset fast -crf 20 -pix_fmt yuv420p -movflags +faststart tests/fixtures/app-optimization/source-720p30.mp4
```

Verified with ffprobe as 1280x720, 30/1 fps, 20 seconds. SHA-256: `77598dff31ced009ca67636798f4016a6669c506ae58c3240aabad0d1cc93160`.

A25-suboct.json contains default Suboct as its audio rack. SHA-256: 75348508f916d404eb7949ba32694cff1eb6728f30c6760e83425ae78509b7a5.

A26-resbank.json contains default Resbank as its audio rack. The exact delay-index candidate was slightly slower and an interpolated tanh table failed recurrent audio-state parity; CPU remains selected. SHA-256: 60b864e0c8887c65f51334d4dbd5ca9c98f655967b13879a4d7b63bb515999e7.

A27-granular.json contains default Granular as its audio rack. SHA-256: 3adcc1ab4b2b8f032530ef9c03bd1f4f9acf71779cd2201e9ce29407ff7e8df1. The index-ordered active-grain CPU traversal passed deterministic sample/state/random-consumption parity; diagnostic app results are recorded in docs/performance-results/app-optimization/A27-granular-active-slots.json.

A28-vocoder.json contains default Vocoder as its audio rack. SHA-256: 5cf4e82df53f40b722d371bcb7943bf89ca533efc1d27ce1c48b23d7e8c0ef8. A coefficient-cache candidate passed exact parity but did not show a useful app gain and was removed; details: docs/performance-results/app-optimization/A28-vocoder-coefficient-cache.json.

A29-shrandom.json contains default S&H Random as its audio rack. SHA-256: 2d6d18b46ea13919c1108a1ce7ebe1c1c413dc6574c2001f835db1264e802973. Its short app profile is recorded in the A29 ledger row; frame-path timing does not isolate DSP cost.

A30-vacuum.json contains default Vacuum Tube Amp as its audio rack. SHA-256: 4f67eba7a05c61dea8beef2ff2a652602f209dbbb2ce3e07512879d73a1f0d77. The CPU screen stayed near the reference app range.

A31-sigmoid.json contains default Sigmoid as its audio rack. SHA-256: 37b62a56e238d1b3ceb5a5c03838fcf17955d2281b4b848fa0b24e049a6933ed.

A32-divider.json contains default Divider as its audio rack. SHA-256: 3ce9ba8fdaaae6e609d3f971752edfeeae05f3035816fd0fb16dd81816a0f716.

A33-shiftr.json contains default TShiftR Fold as its audio rack. SHA-256: 1ca74074912296b453d50c61afc363f18d743404da18627b5ae9b8b541c077c. Scalar WASM sample/state/reset conformance passed, but synthetic WASM timing was slower than JS; the app coordinator does not expose this filter on a WASM route.

A34-randmix.json contains default Randmix as its audio rack. SHA-256: 5ed83dd38dde43fce2f3bfcc4d90244ed41d58bfabcf1628d3efd4b8b1fa3dab. Its app screen is not isolated DSP timing.

A35-amplify.json contains default Amplify as its audio rack. SHA-256: 69f621e1992cf80025679e15f479ac240e6d9b967db45309d76fcdae47acd01.

A36-wavefolder.json contains default Wavefolder as its audio rack. SHA-256: 2c59fc820f0cbd1ff15da79d46f4547758167ed46faeb3c3f6d8478a15566ed3.

A37-compressor.json contains default Compressor as its audio rack. SHA-256: 66fd4a7a5b27445e792ba6363b7bd40952431cffe04bdc26f8d7e5d5175ee705. Its inclusive app screen is not stage-attributed DSP timing.

A38-noisegate.json contains default Noise Gate as its audio rack. SHA-256: d6f200cb4a8714747aa1cc52e2b1f0d5b3c69c9b5853ec93c4843db699c4e167.

A39-envfilter.json contains default Envelope Filter as its audio rack. SHA-256: de3f26dd17f2d7dca2805a6d580159ce14451b7de9e487e1f5a97cb3519390a. Its app profile is not isolated DSP timing.

A40-ducker.json contains default Ducker as its audio rack. SHA-256: 8fdea050d2352eee3f17abbd31972fca3ecbb51b988de80f4941517a8087414f.

A41-limiter.json contains default Look-ahead Limiter as its audio rack. SHA-256: 17e49d85fe4f31b2e91a7b9979493b246fcc540d1e778d5e6e1c78376cbac5dc.

A42-transient.json contains default Transient Shaper as its audio rack. SHA-256: e8cead1cd8933056b1c4e7496ebd6c97db8d1e97237e28b0a7f2904e5dfc90c. Exact branch-removal parity passed; screen evidence: docs/performance-results/app-optimization/A42-transient-branch-removal.json.

A43-expander.json contains default Expander as its audio rack. SHA-256: 493bd8a6b2d5aa1ef637a68f078be3165d0bbc8d9daaa7d071e10a9c228c3dcf. A mathematically exact pow fast path was removed after app p95 regressed.

A44-multiband.json contains default Multiband Compressor as its audio rack. SHA-256: f64d26df7f99f2c575baeedb9a42850c6990a2245f9397733db1d4570d2fadc. Exact zero-gain fast-path parity passed; screen evidence: docs/performance-results/app-optimization/A44-multiband-unity-gain.json.

A45-vynil.json contains Vinyl Record Dust defaults (warp set to the declared maximum 0.4) as its audio rack. SHA-256: e16e57b899ebe85b6dd740a9f779f1b183a7e0a8f0f72735ceba6b6bf4f01eb. The out-of-range declared descriptor default was rejected by preset loading and is not used in the valid fixture.

A46-bitcrusher.json contains default Bitcrusher as its audio rack. SHA-256: c59a3998a222b0497b42951e415a1ee2648111cf80180d9c86fd9d4498cddac9. Exact wrapped-counter parity passed; screen evidence: docs/performance-results/app-optimization/A46-bitcrusher-counter.json.

A47-tapewow.json contains default Tape Wow & Flutter as its audio rack. SHA-256: 728081da10d8d3577a4bb2d3c19bb1c5bb5156b022cc2be784fe936cc4dba23b. Scalar WASM conformance passed, but synthetic timing was slower than JS and the app route is not enabled.

A48-srreducer.json contains default Sample Rate Reducer as its audio rack. SHA-256: dc57f095e274917837b3c154b382a0dc310718d0cea73fc9dd6091884250990.

A49-dropout.json contains default Dropout as its audio rack. SHA-256: 77695df823e1c41bb9aa23ebedf7caad62cf459dfccf1f942d45d25d414a6b2. Its random-trigger app profile does not isolate DSP cost.

A50-telephone.json contains default Telephone/Radio as its audio rack. SHA-256: 2f78c93f988c06306c8a561f97411dfdb26e3a241876ae19a1a5aee34b6fe7dc. Its random noise/crackle app profile is not stage-attributed.

A51-hiss.json contains default Cassette Hiss as its audio rack. SHA-256: 9f55e8d4d0ac5a41b5e0039c2e04968403eb59d63e4a4e4987d62b59e5260a7d. Its random-noise app profile is not stage-attributed.
