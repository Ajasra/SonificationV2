import {spawnSync} from 'node:child_process';
const groups=[
  {args:['tests/browser/app-gpu.spec.ts'],report:'test-results/gpu-browser-report-app.json'},
  {args:['tests/browser/webgpu.spec.ts','--grep-invert','GPU compact audio, raw HUD preview and JS state handoff preserve mapping'],report:'test-results/gpu-browser-report-webgpu.json'},
  {args:['tests/browser/webgpu.spec.ts','--grep','GPU compact audio, raw HUD preview and JS state handoff preserve mapping'],report:'test-results/gpu-browser-report-handoff.json'},
];
for(const group of groups){
  const result=spawnSync(process.execPath,['node_modules/@playwright/test/cli.js','test',...group.args,'--reporter=line,json'],{stdio:'inherit',env:{...process.env,BENCHMARK_GPU_BROWSER:'chrome',PLAYWRIGHT_JSON_OUTPUT_NAME:group.report}});
  if(result.error)throw result.error;
  if(result.status!==0){process.exitCode=result.status??1;break;}
}
if(process.exitCode===undefined)process.exitCode=0;
