import { test, expect } from '@playwright/test';

test('persistent DSP worker preserves ordered state and returns transferred buffers', async ({ page }, testInfo) => {
  await page.goto('/benchmark.html');
  const result = await page.evaluate(async () => {
    const { TShiftRFilter } = await import('/src/engine/filters/distortion/shiftr.ts');
    const worker = new Worker('/src/engine/workers/dsp-probe.worker.ts', { type: 'module' });
    const cpu = new TShiftRFilter(44100);
    const length = 307200, frames = 5;
    let nextId = 0;
    const pending = new Map<number, (buffer: ArrayBuffer) => void>();
    worker.onmessage = (event: MessageEvent<{ id: number; samples: ArrayBuffer }>) => pending.get(event.data.id)?.(event.data.samples);
    const run = (samples: Float32Array) => new Promise<Float32Array>(resolve => {
      const id = nextId++, buffer = samples.buffer;
      pending.set(id, output => { pending.delete(id); resolve(new Float32Array(output)); });
      worker.postMessage({ id, samples: buffer }, [buffer]);
    });
    const cpuMs: number[] = [], workerMs: number[] = [], maxErrors: number[] = [], timerLags: number[] = [];
    let timerAt = performance.now();
    const timer = setInterval(() => { const now = performance.now(); timerLags.push(now - timerAt - 8); timerAt = now; }, 8);
    try {
      for (let frame = 0; frame < frames; frame++) {
        const input = Float32Array.from({ length }, (_, i) => Math.sin((i + frame * 37) * .013));
        const reference = input.slice(), cpuStart = performance.now(); cpu.processBlock(reference); cpuMs.push(performance.now() - cpuStart);
        const workerStart = performance.now(), output = await run(input); workerMs.push(performance.now() - workerStart);
        let maxError = 0; for (let i = 0; i < length; i++) maxError = Math.max(maxError, Math.abs(reference[i] - output[i])); maxErrors.push(maxError);
      }
      await new Promise(resolve => setTimeout(resolve, 30));
      const p95 = (v: number[]) => v.slice().sort((a, b) => a - b)[Math.ceil(v.length * .95) - 1];
      return { length, frames, transferredBytes: length * 4 * frames * 2, cpuP95Ms: p95(cpuMs), workerRoundTripP95Ms: p95(workerMs), maxErrors, timerSamples: timerLags.length, maxTimerLagMs: Math.max(...timerLags), pendingAtEnd: pending.size };
    } finally { clearInterval(timer); worker.terminate(); }
  });
  await testInfo.attach('DSP worker probe',{body:JSON.stringify(result,null,2),contentType:'application/json'});
  console.log('DSP worker probe:', JSON.stringify(result));
  expect(result.maxErrors.every(error => error === 0)).toBe(true);
  expect(result.pendingAtEnd).toBe(0);
  expect(result.timerSamples).toBeGreaterThan(0);
});
