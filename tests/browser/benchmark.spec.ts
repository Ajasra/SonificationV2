import { test, expect } from '@playwright/test';

test('reference video benchmark completes and exports an attributed report', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/benchmark.html');
  // Generate a local smoke fixture in-browser; this tests real decoding and
  // callbacks, not physical camera fidelity or a performance acceptance target.
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 1280; canvas.height = 720;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(30);
    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' });
    recorder.ondataavailable = event => chunks.push(event.data);
    const stopped = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
    let frame = 0;
    const timer = setInterval(() => {
      ctx.fillStyle = `rgb(${frame++ % 255},80,160)`; ctx.fillRect(0, 0, 1280, 720);
      ctx.fillStyle = 'white'; ctx.fillRect((frame * 15) % 1280, 0, 100, 720);
    }, 33);
    recorder.start(); await new Promise(resolve => setTimeout(resolve, 1200));
    recorder.stop(); await stopped; clearInterval(timer); stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));
  });
  await page.locator('#source').setInputFiles({ name: 'synthetic-smoke-720p30.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) });
  await expect(page.locator('#run')).toBeEnabled();
  await page.locator('#duration').fill('0');
  await page.locator('#run').click();
  await expect(page.locator('#status')).toContainText('1–300 seconds');
  await expect(page.locator('#stop')).toBeDisabled();
  await page.locator('#duration').fill('1');
  await page.locator('#fps').selectOption('30');
  await page.locator('#run').click();
  await expect(page.locator('#report')).toContainText('"schemaVersion": 1', { timeout: 30_000 });
  const report = JSON.parse(await page.locator('#report').textContent() || '{}');
  expect(report.decodedWidth).toBe(1280); expect(report.decodedHeight).toBe(720);
  expect(report.measuredFrames).toBeGreaterThan(0);
  expect(report.measuredSeconds).toBeGreaterThanOrEqual(1);
  expect(report.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(report.build.revision).toMatch(/^[a-f0-9]{40}$/);
  expect(report.timings.completeCpuPathMs.p95).toBeGreaterThan(0);
  expect(report.timings.setupMs.count).toBe(report.measuredFrames);
  expect(report.acceptance).toContain('not evaluated');
  await test.info().attach('reference-smoke-report', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
  const downloading = page.waitForEvent('download');
  await page.locator('#download').click();
  expect((await downloading).suggestedFilename()).toBe(`benchmark-${report.runId}.json`);
  // Starting and cancelling a second run invalidates the completed report.
  await page.locator('#run').click(); await page.locator('#stop').click();
  await expect(page.locator('#run')).toBeEnabled();
  await expect(page.locator('#download')).toBeDisabled();
  await expect(page.locator('#report')).toBeEmpty();
});

test('benchmark starts with controls disabled until a video is loaded', async ({ page }) => {
  await page.goto('/benchmark.html');
  await expect(page.locator('#run')).toBeDisabled();
  await expect(page.locator('#stop')).toBeDisabled();
  await expect(page.locator('#download')).toBeDisabled();
});
