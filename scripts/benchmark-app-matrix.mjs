import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(process.env.SONIFICATION_REPO_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'));
const runner = path.join(root, 'scripts', 'benchmark-app-gpu.mjs');
const repoOutput = path.join(root, 'docs', 'performance-results', 'next-acceleration', 'P00');
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
}
const video = path.resolve(option('--video', ''));
const duration = Number(option('--duration', '60'));
const volume = Number(option('--volume', '0.01'));
const deviceLabel = option('--device-label', '');
const headed = args.includes('--headed');
if (!video || !args.includes('--video')) throw new Error('Provide --video <verified-30fps-source>.');
if (!Number.isInteger(duration) || duration < 5 || duration > 3600) throw new Error('--duration must be an integer from 5 to 3600 seconds.');
if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error('--volume must be between 0 and 1.');
if (!headed) throw new Error('Pass --headed so the matrix measures the visible application route.');
const probe = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,avg_frame_rate', '-of', 'json', video], { encoding: 'utf8' });
if (probe.status !== 0) throw new Error(`ffprobe could not verify the source: ${probe.stderr || probe.error?.message || 'unknown error'}`);
const sourceStream = JSON.parse(probe.stdout).streams?.[0];
const [rateNumerator, rateDenominator] = (sourceStream?.avg_frame_rate ?? '').split('/').map(Number);
if (sourceStream?.width !== 1280 || sourceStream?.height !== 720 || rateNumerator / rateDenominator !== 30) {
  throw new Error(`Expected a 1280x720 30 fps source; found ${sourceStream?.width}x${sourceStream?.height} @ ${sourceStream?.avg_frame_rate} fps.`);
}

const baselineRoute = option('--baseline', '');
const candidateRoute = option('--candidate', '');
const phase = option('--phase', '');
if (baselineRoute || candidateRoute || phase) {
  if (!baselineRoute || !candidateRoute || !['screen', 'accept'].includes(phase)) {
    throw new Error('Pair mode requires --baseline <route> --candidate <route> --phase <screen|accept>.');
  }
  const presetPath = path.resolve(option('--preset', ''));
  if (!args.includes('--preset')) throw new Error('Pair mode requires --preset <json>.');
  const presetBytes = await readFile(presetPath);
  const preset = JSON.parse(presetBytes.toString('utf8'));
  const presetSha256 = createHash('sha256').update(presetBytes).digest('hex');
  const allowedRoutes = new Set(['auto', 'cpu-reference', 'gpu-tapesat', 'wasm-cpu', 'cpu-gpu-video-tail', 'gpu-resident-rack']);
  for (const route of [baselineRoute, candidateRoute]) if (!allowedRoutes.has(route)) throw new Error(`Unknown route: ${route}`);
  const outputRoot = path.resolve(option('--output-dir', path.join(root, 'docs', 'performance-results', 'app-optimization')));
  await mkdir(outputRoot, { recursive: true });
  const resumeManifestPath = option('--resume-manifest', '');
  const resumeManifest = resumeManifestPath ? JSON.parse(await readFile(path.resolve(resumeManifestPath), 'utf8')) : null;
  if (resumeManifest && (resumeManifest.phase !== 'screen' || resumeManifest.status !== 'incomplete' || resumeManifest.baselineRoute !== baselineRoute || resumeManifest.candidateRoute !== candidateRoute || resumeManifest.presetSha256 !== presetSha256 || resumeManifest.durationSeconds !== 15 || resumeManifest.runs?.[0]?.route !== baselineRoute)) {
    throw new Error('--resume-manifest must be a matching incomplete screen checkpoint with its first baseline run complete.');
  }
  const pairId = resumeManifest?.pairId ?? `${new Date().toISOString().replaceAll(':', '').replaceAll('.', '-')}-${randomUUID().slice(0, 8)}`;
  const pairTemp = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), 'sonification-app-pair-')));
  const reportDir = path.join(pairTemp, 'reports');
  await mkdir(reportDir, { recursive: true });
  const rounds = phase === 'screen' ? [[baselineRoute, candidateRoute], [candidateRoute, baselineRoute]] : [[baselineRoute, candidateRoute], [candidateRoute, baselineRoute], [baselineRoute, candidateRoute]];
  const durationSeconds = phase === 'screen' ? 15 : 60;
  const runs = resumeManifest ? resumeManifest.runs.slice(0, 1) : [];
  const checkpointPath = path.join(pairTemp, 'manifest.json');
  async function checkpoint(status) {
    await writeFile(checkpointPath, `${JSON.stringify({ schemaVersion: 1, pairId, phase, status, baselineRoute, candidateRoute, video, preset: presetPath, presetSha256, durationSeconds, runs }, null, 2)}\n`);
  }
  for (let index = 0; index < rounds.flat().length; index++) {
    if (index < runs.length) continue;
    const route = rounds.flat()[index];
    const runDuration = durationSeconds;
    console.log(`\n=== ${phase} run ${index + 1}/${rounds.flat().length}: ${route} (${runDuration}s) ===`);
    const reportsBefore = new Set((await readdir(reportDir)).filter(name => name.startsWith('app-benchmark-') && name.endsWith('.json')));
    const childArgs = [runner, '--route', route, '--preset', presetPath, '--backend', route === 'gpu-tapesat' ? 'gpu' : route === 'wasm-cpu' ? 'wasm' : 'js',
      '--duration', String(runDuration), '--video', video, '--audio', 'active', '--volume', String(volume), '--hud', 'on', '--profile', 'off', '--source-fps', '30', '--output-dir', reportDir, '--headed'];
    if (deviceLabel) childArgs.push('--device-label', deviceLabel);
    const result = spawnSync(process.execPath, childArgs, { cwd: root, stdio: 'inherit', timeout: (runDuration + 120) * 1000, windowsHide: true });
    const generated = (await readdir(reportDir)).filter(name => !reportsBefore.has(name) && name.startsWith('app-benchmark-') && name.endsWith('.json'));
    const entry = { index: index + 1, route, exitCode: result.status, error: result.error?.message ?? null, report: null, metrics: null };
    if (generated.length === 1) {
      const sourcePath = path.join(reportDir, generated[0]);
      const report = JSON.parse(await readFile(sourcePath, 'utf8'));
      const stableName = `app-optimization-${pairId}-${String(index + 1).padStart(2, '0')}-${route}.json`;
      const finalPath = path.join(outputRoot, stableName);
      await copyFile(sourcePath, finalPath);
      entry.report = stableName;
      entry.metrics = { actualRoute: report.route?.selectedRouteId ?? null, sourceSha256: report.source?.sha256 ?? null,
        build: report.build ?? null, measuredSeconds: report.measuredSeconds ?? null, measuredFrames: report.measuredFrames ?? null,
        processedFps: report.processedFps ?? null, framePathMs: report.timings?.framePathMs ?? null,
        audioMuted: report.audioMuted ?? null, audioContextState: report.audioContextState ?? null, hudEnabled: report.hudEnabled ?? null,
        fidelityPassed: route === 'gpu-tapesat' ? Boolean(report.gpuValidation?.sample?.passed && report.gpuValidation?.resident?.passed) : route === 'cpu-gpu-video-tail' ? Boolean(report.gpuVideoTailValidation?.passed) : route === 'gpu-resident-rack' ? Boolean(report.gpuValidation?.sample?.passed && report.gpuValidation?.resident?.passed && report.gpuVideoTailValidation?.passed) : null };
      if (entry.metrics.actualRoute !== route && route !== 'auto') entry.error = `forced route mismatch: ${entry.metrics.actualRoute}`;
      if (entry.metrics.sourceSha256 !== createHash('sha256').update(await readFile(video)).digest('hex')) entry.error = 'source hash mismatch';
      if (entry.metrics.measuredSeconds < runDuration * 0.9) entry.error = 'measured interval shorter than requested route window';
      if (entry.metrics.measuredFrames < 1) entry.error = 'no processed frames';
      if (entry.metrics.audioMuted !== false || entry.metrics.audioContextState !== 'running') entry.error = 'active audio was not confirmed';
      if (entry.metrics.hudEnabled !== true) entry.error = 'HUD was not confirmed enabled';
      if (route === 'cpu-gpu-video-tail' && !entry.metrics.fidelityPassed) entry.error = 'GPU video-tail parity validation failed or is missing';
    if (route === 'gpu-resident-rack' && !entry.metrics.fidelityPassed) entry.error = 'Resident TapeSat or video-tail parity validation failed or is missing';
    } else entry.error = `${entry.error ?? ''} Expected one new report for this run, found ${generated.length}.`.trim();
    runs.push(entry);
    await checkpoint('running');
    if (result.status !== 0 || entry.error) { await checkpoint('incomplete'); throw new Error(`Pair stopped after run ${index + 1}; checkpoint: ${checkpointPath}; ${entry.error ?? 'runner failed'}`); }
  }
  const comparisons = [];
  for (let index = 0; index < rounds.length; index++) {
    const pairRuns = runs.slice(index * 2, index * 2 + 2);
    const baselineRun = pairRuns.find(run => run.route === baselineRoute);
    const candidateRun = pairRuns.find(run => run.route === candidateRoute);
    comparisons.push({ pair: index + 1, baselineRun: baselineRun.index, candidateRun: candidateRun.index,
      p95DeltaMs: candidateRun.metrics.framePathMs.p95 - baselineRun.metrics.framePathMs.p95,
      fpsRelativeDelta: baselineRun.metrics.processedFps ? candidateRun.metrics.processedFps / baselineRun.metrics.processedFps - 1 : null });
  }
  const orderedDeltas = comparisons.map(pair => pair.p95DeltaMs).sort((a, b) => a - b);
  const medianP95DeltaMs = orderedDeltas[Math.floor(orderedDeltas.length / 2)];
  const baselineP95 = runs.filter(run => run.route === baselineRoute).map(run => run.metrics.framePathMs.p95).sort((a, b) => a - b)[Math.floor((runs.filter(run => run.route === baselineRoute).length - 1) / 2)];
  const improvementGateMs = Math.max(2, baselineP95 * 0.1);
  const benefitPassed = medianP95DeltaMs <= -improvementGateMs && comparisons.filter(pair => pair.p95DeltaMs < 0).length >= 2 && comparisons.every(pair => pair.p95DeltaMs <= baselineP95 * 0.05 && pair.fpsRelativeDelta >= -0.02);
const candidateRuns = runs.filter(run => run.route === candidateRoute);
const absoluteGatePassed = phase === 'accept' ? candidateRuns.every(run => run.metrics.processedFps >= 29.4 && run.metrics.framePathMs.p95 <= 25) : null;
  const manifest = { schemaVersion: 1, pairId, phase, status: 'complete', video, source: { width: sourceStream.width, height: sourceStream.height, frameRate: 30 },
    sourceSha256: createHash('sha256').update(await readFile(video)).digest('hex'), preset: presetPath, presetSha256, baselineRoute, candidateRoute, deviceLabel: deviceLabel || null,
    revision: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim(), durationSeconds, warmupSeconds: 10,
    resumedFrom: resumeManifestPath || null,
    conditions: { audio: `active at ${volume}`, hud: 'on', profiling: 'off', headed: true }, runs, comparisons, medianP95DeltaMs, improvementGateMs, benefitPassed, absoluteGatePassed,
    acceptancePassed: phase === 'accept' ? benefitPassed && absoluteGatePassed : null,
    note: 'Application-path screen or acceptance only; a running audio context does not verify physical audio output or display scan-out.' };
  const manifestPath = path.join(outputRoot, `app-optimization-${pairId}-${phase}-manifest.json`);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await checkpoint('complete');
  console.log(`Pair ${phase} complete: ${manifestPath}; median p95 delta ${medianP95DeltaMs.toFixed(2)} ms; benefit ${benefitPassed ? 'passed' : 'not passed'}.`);
  if (phase === 'accept' && benefitPassed && absoluteGatePassed) console.log('Candidate benefit and absolute gates passed; the 300-second winner confirmation remains required.');
  else if (phase === 'accept' && benefitPassed) console.log('Candidate is incremental-only because the 720p30 absolute gate failed; no 300-second release confirmation is eligible.');
  process.exit(0);
}

const matrixId = `${new Date().toISOString().replaceAll(':', '').replaceAll('.', '-')}-${randomUUID().slice(0, 8)}`;
const tempRoot = await import('node:fs/promises').then(({ mkdtemp }) => mkdtemp(path.join(os.tmpdir(), 'sonification-app-matrix-')));
const tempReports = path.join(tempRoot, 'reports');
await mkdir(tempReports, { recursive: true });
const order = ['js', 'wasm', 'gpu', 'gpu', 'wasm', 'js', 'js', 'gpu', 'wasm'];
const runs = [];
const pendingReports = [];
const startedAt = new Date().toISOString();
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();

async function checkpoint(status) {
  await writeFile(path.join(tempRoot, 'manifest.json'), `${JSON.stringify({ schemaVersion: 1, matrixId, revision, startedAt, updatedAt: new Date().toISOString(), status, video, deviceLabel: deviceLabel || null, durationSeconds: duration, order, runs }, null, 2)}\n`);
}

for (let index = 0; index < order.length; index++) {
  const backend = order[index];
  console.log(`\n=== matched application run ${index + 1}/${order.length}: ${backend.toUpperCase()} ===`);
  const before = new Set(await readdir(tempReports));
  const childArgs = [runner, '--backend', backend, '--duration', String(duration), '--video', video,
    '--audio', 'active', '--volume', String(volume), '--hud', 'on', '--profile', 'off',
    '--source-fps', '30', '--output-dir', tempReports];
  if (deviceLabel) childArgs.push('--device-label', deviceLabel);
  if (headed) childArgs.push('--headed');
  const result = spawnSync(process.execPath, childArgs, {
    cwd: root,
    stdio: 'inherit',
    timeout: (duration + 180) * 1000,
    windowsHide: true,
  });
  const generated = (await readdir(tempReports)).filter(name => !before.has(name) && name.startsWith('app-benchmark-') && name.endsWith('.json'));
  const entry = { index: index + 1, backend, exitCode: result.status, signal: result.signal ?? null, error: result.error?.message ?? null, report: null, metrics: null };
  if (generated.length === 1) {
    const tempPath = path.join(tempReports, generated[0]);
    const report = JSON.parse(await readFile(tempPath, 'utf8'));
    const stableName = `app-benchmark-matrix-${matrixId}-${String(index + 1).padStart(2, '0')}-${backend}.json`;
    pendingReports.push({ tempPath, stableName });
    entry.report = `P00/${stableName}`;
    entry.metrics = {
      sourceSha256: report.source?.sha256 ?? null,
      revision: report.build?.revision ?? null,
      dirty: report.build?.dirty ?? null,
      measuredSeconds: report.measuredSeconds ?? null,
      measuredFrames: report.measuredFrames ?? null,
      processedFps: report.processedFps ?? null,
      framePathMs: report.timings?.framePathMs ?? null,
      missedPresentedCallbacks: report.missedPresentedCallbacks ?? null,
      fidelityPassed: backend === 'gpu' ? Boolean(report.gpuValidation?.sample?.passed && report.gpuValidation?.resident?.passed) : null,
      captureMode: report.gpuValidation?.captureMode ?? null,
      transferLedger: report.transferLedger ?? null,
      audioMuted: report.audioMuted ?? null,
      audioContextState: report.audioContextState ?? null,
      hudEnabled: report.hudEnabled ?? null,
      backendFrameCounts: { js: report.jsFrames ?? 0, wasm: report.wasmFrames ?? 0, gpu: report.gpuFrames ?? 0, gpuVideoTail: report.gpuVideoTailFrames ?? 0, gpuResident: report.gpuResidentFrames ?? 0 },
      problems: [],
    };
    const frameKey = { 'cpu-reference': 'js', 'wasm-cpu': 'wasm', 'gpu-tapesat': 'gpu', 'cpu-gpu-video-tail': 'gpuVideoTail', 'gpu-resident-rack': 'gpuResident' }[entry.metrics.actualRoute];
    const expectedFrames = frameKey ? entry.metrics.backendFrameCounts[frameKey] : 0;
    const unexpectedFrames = Object.entries(entry.metrics.backendFrameCounts).filter(([name, count]) => name !== frameKey && count > 0);
    if (result.status !== 0) entry.metrics.problems.push('benchmark command failed; inspect raw report and command output');
    if (entry.metrics.dirty !== false) entry.metrics.problems.push('build was not clean');
    if (entry.metrics.revision !== revision) entry.metrics.problems.push('build revision differs from matrix revision');
    const minimumMeasuredSeconds = duration * (duration < 30 ? 0.9 : 0.95);
    if (entry.metrics.measuredSeconds < minimumMeasuredSeconds) entry.metrics.problems.push(`measured interval was shorter than ${minimumMeasuredSeconds}s`);
    if (expectedFrames < 1) entry.metrics.problems.push(`selected backend produced no frames: ${expectedFrames}`);
    if (unexpectedFrames.length) entry.metrics.problems.push(`unexpected backend frames: ${JSON.stringify(unexpectedFrames)}`);
    if (entry.metrics.audioMuted !== false || report.audioContextState !== 'running') entry.metrics.problems.push('active audio was not confirmed');
    if (entry.metrics.hudEnabled !== true) entry.metrics.problems.push('HUD was not confirmed enabled');
    if (backend === 'gpu' && !entry.metrics.fidelityPassed) entry.metrics.problems.push('GPU fidelity validation failed or is missing');
    if (runs[0] && entry.metrics.sourceSha256 !== runs[0].metrics?.sourceSha256) entry.metrics.problems.push('source hash differs from first completed run');
  } else {
    entry.error = `${entry.error ?? ''} Expected one generated report, found ${generated.length}.`.trim();
  }
  runs.push(entry);
  await checkpoint('running');
  if (result.status !== 0 || generated.length !== 1) {
    console.error(`Matrix stopped after run ${index + 1}; checkpoint: ${path.join(tempRoot, 'manifest.json')}`);
    await checkpoint('incomplete');
    process.exitCode = 1;
    break;
  }
}

const groups = Object.fromEntries(['js', 'wasm', 'gpu'].map(backend => [backend, runs.filter(run => run.backend === backend)]));
const rounds = [
  { js: 1, wasm: 2, gpu: 3 },
  { js: 6, wasm: 5, gpu: 4 },
  { js: 7, wasm: 9, gpu: 8 },
].filter(round => Object.values(round).every(id => runs.some(run => run.index === id)));
const pairs = rounds.flatMap((round, roundIndex) => [
  ['js', 'wasm'], ['js', 'gpu'],
].map(([baseline, candidate]) => {
  const a = runs.find(run => run.index === round[baseline]);
  const b = runs.find(run => run.index === round[candidate]);
  return {
    round: roundIndex + 1, baseline, candidate,
    baselineRun: a?.index ?? null, candidateRun: b?.index ?? null,
    processedFpsDelta: a && b ? b.metrics.processedFps - a.metrics.processedFps : null,
    frameP95DeltaMs: a && b ? b.metrics.framePathMs.p95 - a.metrics.framePathMs.p95 : null,
    sourceMatch: Boolean(a && b && a.metrics.sourceSha256 === b.metrics.sourceSha256),
    revisionMatch: Boolean(a && b && a.metrics.revision === b.metrics.revision),
  };
}));
const allRunsComplete = runs.length === order.length && runs.every(run => run.exitCode === 0 && run.metrics?.problems?.length === 0);
const acceptance = Object.fromEntries(['js', 'wasm', 'gpu'].map(backend => {
  const backendRuns = groups[backend];
  return [backend, {
    minimumProcessedFps: 29.4,
    maximumFramePathP95Ms: 25,
    runsMeetingFps: backendRuns.filter(run => run.metrics?.processedFps >= 29.4).length,
    runsMeetingP95: backendRuns.filter(run => run.metrics?.framePathMs?.p95 <= 25).length,
    fidelityPasses: backend === 'gpu' ? backendRuns.filter(run => run.metrics?.fidelityPassed).length : null,
  }];
}));
const manifest = {
  schemaVersion: 1, matrixId, revision, startedAt, finishedAt: new Date().toISOString(),
  status: allRunsComplete ? 'complete' : 'incomplete', video, deviceLabel: deviceLabel || null,
  durationSeconds: duration, source: { width: sourceStream.width, height: sourceStream.height, frameRate: 30 },
  sourceCadence: 'Source independently verified by ffprobe; raw source hash checked by each run',
  conditions: { resolution: '1280x720', audio: `active browser audio context, volume ${volume}`, hud: 'on', profile: 'off', headed, order },
  runs, backendRunCounts: Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.length])),
  pairComparisons: pairs, acceptance,
  reportScope: 'Headed Chrome application processing and canvas/HUD/audio-context submission path. A running audio context does not confirm audible speaker output or physical display scan-out.',
};
const manifestPath = path.join(repoOutput, `app-backend-matrix-${matrixId}.json`);
await Promise.all(pendingReports.map(({ tempPath, stableName }) => copyFile(tempPath, path.join(repoOutput, stableName))));
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await checkpoint(manifest.status);
console.log(`\nMatrix ${manifest.status}: ${manifestPath}`);
console.log(`Pair deltas: ${JSON.stringify(pairs)}`);
console.log(`Checkpoint and temporary reports: ${tempRoot}`);
if (!allRunsComplete) process.exitCode = 1;
