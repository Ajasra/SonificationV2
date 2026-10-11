import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'native/dsp/toolchain.json'), 'utf8'));
const sdk = process.env.EMSDK || path.join(root, '.tools/emsdk');
const compiler = path.join(sdk, 'upstream/emscripten/emcc.py');
const python = process.env.EMSDK_PYTHON || (process.platform === 'win32' ? path.join(sdk, 'python/3.13.3_64bit/python.exe') : 'python3');
const env = { ...process.env, EM_CONFIG: path.join(sdk, '.emscripten') };
function run(args) {
  const result = spawnSync(python, args, { cwd: root, env, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}
const version = run([compiler, '--version']);
if (!version.includes(` ${config.emscripten} `) && !version.includes(` ${config.emscripten}\n`)) throw new Error(`Expected Emscripten ${config.emscripten}, got ${version}`);
const output = path.join(root, 'public/wasm'); fs.mkdirSync(output, { recursive: true });
const exported = ['malloc', 'free', 'dsp_abi_version', 'dsp_sine_table', 'dsp_create', 'dsp_destroy', 'dsp_reset', 'dsp_set_params',
  'dsp_state', 'dsp_history', 'dsp_history_length', 'dsp_rng', 'dsp_position', 'dsp_noise_count', 'dsp_process', 'dsp_process_chain'];
const commonFlags = ['-O3', '-fno-fast-math', '-ffp-contract=off', '-fno-exceptions',
  '-sSTANDALONE_WASM=1', '--no-entry', '-sFILESYSTEM=0', '-sMALLOC=emmalloc', '-sINITIAL_MEMORY=67108864', '-sSTACK_SIZE=1048576',
  `-sEXPORTED_FUNCTIONS=${JSON.stringify(exported.map(name => '_' + name))}`];
const hash = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
for (const variant of ['scalar', 'simd']) {
  const flags = [...commonFlags, ...(variant === 'scalar' ? ['-fno-vectorize', '-fno-slp-vectorize'] : ['-msimd128'])];
  const filename = path.join(output, `dsp-${variant}.wasm`);
  run([compiler, 'native/dsp/dsp.cpp', ...flags, '-o', filename]);
  const metadata = { ...config, variant, build: `${variant} O3; no fast math or contraction`, flags, compilerVersion: version.trim(),
    sourceSha256: hash(path.join(root, 'native/dsp/dsp.cpp')), wasmSha256: hash(filename) };
  fs.writeFileSync(path.join(output, `dsp-${variant}.build.json`), JSON.stringify(metadata, null, 2) + '\n');
  console.log(`Built ${variant} DSP with Emscripten ${config.emscripten}`);
}
