import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Load key files for structural analysis
const rootDir = path.resolve('.');
const htmlContent = fs.readFileSync(path.join(rootDir, 'index.html'), 'utf8');
const layoutCss = fs.readFileSync(path.join(rootDir, 'src/styles/layout.css'), 'utf8');
const tokensCss = fs.readFileSync(path.join(rootDir, 'src/styles/tokens.css'), 'utf8');
const telemetryCss = fs.readFileSync(path.join(rootDir, 'src/styles/telemetry.css'), 'utf8');
const viewportCss = fs.readFileSync(path.join(rootDir, 'src/styles/viewport.css'), 'utf8');

test('Desktop safety net: HTML structural landmarks must be present', () => {
  // Topbar, hero, workspace grid, sidebar rack, viewport card, footer
  assert.ok(htmlContent.includes('class="studio-topbar"'), 'studio-topbar must exist');
  assert.ok(htmlContent.includes('class="studio-hero-bar"'), 'studio-hero-bar must exist');
  assert.ok(htmlContent.includes('class="workspace-grid"'), 'workspace-grid must exist');
  assert.ok(htmlContent.includes('class="sidebar-rack-panel"'), 'sidebar-rack-panel must exist');
  assert.ok(htmlContent.includes('class="viewport-card"'), 'viewport-card must exist');
  assert.ok(htmlContent.includes('class="studio-footer"'), 'studio-footer must exist');
});

test('Desktop safety net: Desktop media input controls must exist', () => {
  // Desktop supports Image, Video, and Camera
  assert.ok(htmlContent.includes('id="input-file"'), 'Image input #input-file must exist for desktop');
  assert.ok(htmlContent.includes('id="input-video-file"'), 'Video input #input-video-file must exist for desktop');
  assert.ok(htmlContent.includes('id="btn-toggle-camera"'), 'Camera toggle #btn-toggle-camera must exist for desktop');
});

test('Desktop safety net: Desktop transport tools and telemetry bay must exist', () => {
  assert.ok(htmlContent.includes('id="btn-sync-mode"'), 'SYNC mode button must exist');
  assert.ok(htmlContent.includes('id="btn-record-video"'), 'Desktop REC button must exist');
  assert.ok(htmlContent.includes('id="btn-shutter"'), 'Desktop shutter button must exist');
  assert.ok(htmlContent.includes('id="btn-toggle-hud"'), 'Desktop HUD button must exist');
  assert.ok(htmlContent.includes('id="telemetry-hud-bay"'), 'Side CRT Telemetry Bay must exist');
  assert.ok(htmlContent.includes('id="hud-canvas"'), 'CRT Scope canvas #hud-canvas must exist');
  assert.ok(htmlContent.includes('class="hud-matrix-grid"'), 'Monospace telemetry matrix must exist');
  assert.ok(htmlContent.includes('class="hud-meter-strip"'), 'Discrete VU meters must exist');
});

test('Desktop safety net: Eurorack modular cards must exist', () => {
  assert.ok(htmlContent.includes('id="card-input"'), '00 / INPUT module must exist');
  assert.ok(htmlContent.includes('id="card-sound"'), '01 / SOUND module must exist');
  assert.ok(htmlContent.includes('id="card-preset"'), '02 / PRESET module must exist');
  assert.ok(htmlContent.includes('id="card-topology"'), '03 / TOPOLOGY module must exist');
  assert.ok(htmlContent.includes('id="card-dsp"'), '04 / DSP RACK module must exist');
});

test('Desktop safety net: Core design tokens must remain defined', () => {
  assert.ok(tokensCss.includes('--bg-darkest'), '--bg-darkest token must exist');
  assert.ok(tokensCss.includes('--bg-dark'), '--bg-dark token must exist');
  assert.ok(tokensCss.includes('--accent-phosphor'), '--accent-phosphor token must exist');
  assert.ok(tokensCss.includes('--accent-copper'), '--accent-copper token must exist');
  assert.ok(tokensCss.includes('--font-serif'), '--font-serif token must exist');
  assert.ok(tokensCss.includes('--font-mono'), '--font-mono token must exist');
});

test('Desktop safety net: Desktop grid specifications in layout.css remain intact', () => {
  assert.ok(layoutCss.includes('.workspace-grid'), '.workspace-grid rule must exist in layout.css');
  assert.ok(layoutCss.includes('.sidebar-rack-panel'), '.sidebar-rack-panel rule must exist in layout.css');
  assert.ok(layoutCss.includes('.studio-footer'), '.studio-footer rule must exist in layout.css');
});
