import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'native/dsp/toolchain.json'), 'utf8'));
const sdk = process.env.EMSDK || path.join(root, '.tools/emsdk');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
if (!fs.existsSync(path.join(sdk, 'emsdk.py'))) {
  fs.mkdirSync(path.dirname(sdk), { recursive: true });
  run('git', ['clone', 'https://github.com/emscripten-core/emsdk.git', sdk]);
}
run('git', ['checkout', '--detach', config.emsdkCommit], sdk);
const python = process.env.EMSDK_PYTHON || (process.platform === 'win32' ? 'py' : 'python3');
run(python, [path.join(sdk, 'emsdk.py'), 'install', config.emscripten]);
run(python, [path.join(sdk, 'emsdk.py'), 'activate', '--embedded', config.emscripten]);
