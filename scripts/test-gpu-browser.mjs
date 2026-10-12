import {spawnSync} from 'node:child_process';
const result=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test','tests/browser/webgpu.spec.ts','--reporter=line,json'],{stdio:'inherit',env:{...process.env,BENCHMARK_GPU_BROWSER:'chrome',PLAYWRIGHT_JSON_OUTPUT_NAME:'test-results/gpu-browser-report.json'}});
if(result.error)throw result.error;
process.exitCode=result.status??1;
