import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const playwright = path.join(root, 'node_modules', '@playwright', 'test', 'cli.js');
const reportDir = path.join(root, 'docs', 'performance-results', 'next-acceleration', 'automated-runs');
const runId = `${new Date().toISOString().replaceAll(':', '').replaceAll('.', '-')}-${randomUUID().slice(0, 8)}`;
const startedAt = new Date().toISOString();
const skipGpu = process.argv.includes('--skip-gpu');
const results = [];
let revision = 'unknown';
let workingTreeStatus = 'unavailable';
try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}
try { workingTreeStatus = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim(); } catch {}

function run(name, command, args, options = {}) {
  const started = Date.now();
  console.log(`\n=== ${name} ===`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    timeout: options.timeoutMs ?? 600_000,
    env: { ...process.env, ...(options.env ?? {}) },
    shell: options.shell ?? false,
    windowsHide: true,
  });
  const status = result.error?.code === 'ETIMEDOUT' ? 'timed_out' : result.status === 0 ? 'passed' : 'failed';
  const entry = {
    name,
    command: [command, ...args],
    status,
    exitCode: result.status,
    signal: result.signal ?? null,
    error: result.error?.message ?? null,
    durationMs: Date.now() - started,
  };
  results.push(entry);
  console.log(`=== ${name}: ${status} (${entry.durationMs} ms) ===`);
  return entry;
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npmOptions = { shell: process.platform === 'win32' };
const unitFiles = (await readdir(path.join(root, 'tests'))).filter(file => file.endsWith('.test.mjs')).map(file => path.join(root, 'tests', file));
run('node-suite', process.execPath, ['--test', ...unitFiles]);
const wasm = run('wasm-conformance', process.execPath, ['--test', path.join(root, 'tests', 'wasm_conformance.test.mjs')]);
const build = run('production-build', npmCommand, ['run', 'build'], npmOptions);
const benchmarkBuild = run('benchmark-build', npmCommand, ['run', 'build:benchmark'], npmOptions);
const browser = run('benchmark-and-worker-browser', process.execPath, [playwright, 'test', 'tests/browser/benchmark.spec.ts', 'tests/browser/worker-probe.spec.ts'], { timeoutMs: 600_000 });

if (!skipGpu) {
  const gpuEnv = { BENCHMARK_GPU_BROWSER: 'chrome' };
  run('gpu-application-integration', process.execPath, [playwright, 'test', 'tests/browser/app-gpu.spec.ts', '--timeout=120000'], { timeoutMs: 300_000, env: gpuEnv });
  run('gpu-kernel-and-temporal-suite', process.execPath, [playwright, 'test', 'tests/browser/webgpu.spec.ts', '--grep-invert', 'GPU compact audio, raw HUD preview and JS state handoff preserve mapping', '--timeout=120000'], { timeoutMs: 300_000, env: gpuEnv });
  run('gpu-monitor-and-state-handoff', process.execPath, [playwright, 'test', 'tests/browser/webgpu.spec.ts', '--grep', 'GPU compact audio, raw HUD preview and JS state handoff preserve mapping', '--timeout=120000'], { timeoutMs: 180_000, env: gpuEnv });
}

const summary = {
  schemaVersion: 1,
  runId,
  startedAt,
  finishedAt: new Date().toISOString(),
  revision,
  workingTreeCleanAtStart: workingTreeStatus === '',
  workingTreeStatusAtStart: workingTreeStatus,
  host: { platform: process.platform, arch: process.arch, release: os.release(), cpus: os.cpus().length, node: process.version },
  hardware: 'Not automatically identified; record physical device/adapter separately.',
  skipGpu,
  results,
  status: results.every(result => result.status === 'passed') ? 'passed' : 'incomplete',
  externalGates: ['visible-device 30 fps acceptance', 'Android/iPhone matrix', 'camera and sustained 300-second runs', 'offline MP4 parity and deployed HTTPS/cache checks'],
};
await mkdir(reportDir, { recursive: true });
const reportPath = path.join(reportDir, `${runId}.json`);
await writeFile(reportPath, `${JSON.stringify(summary, null, 2)}\n`);
await writeFile(path.join(reportDir, 'latest.json'), `${JSON.stringify(summary, null, 2)}\n`);
const digest = createHash('sha256').update(JSON.stringify(summary)).digest('hex');
console.log(`\nAcceleration test run: ${summary.status}`);
console.log(`Report: ${path.relative(root, reportPath)}`);
console.log(`Report SHA-256: ${digest}`);
console.log(`Passed ${results.filter(result => result.status === 'passed').length}/${results.length} local gates.`);
if (summary.status !== 'passed') process.exitCode = 1;
