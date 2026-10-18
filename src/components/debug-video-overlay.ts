import type { SonificationPreset } from '../types/index.ts';
import { FILTER_DESCRIPTORS } from '../engine/filters/factory.ts';
import { VIDEO_FILTER_DESCRIPTORS } from '../engine/video-filters/factory.ts';
import { resolveChain } from '../engine/chain.ts';

/** Video-facing instrumentation, created only when ?debug is present. */
export class DebugVideoOverlay {
  readonly canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d')!;
  private rawSamples: ArrayLike<number> = [];
  private outputSamples: ArrayLike<number> = [];

  constructor(frame: HTMLElement) {
    this.canvas.className = 'debug-video-overlay';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.canvas.dataset.debugOverlay = 'true';
    frame.appendChild(this.canvas);
  }

  update(preset: SonificationPreset, width: number, height: number, raw?: ArrayLike<number>, output?: ArrayLike<number>): void {
    if (raw) this.rawSamples = raw;
    if (output) this.outputSamples = output;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.draw(preset);
  }

  private draw(preset: SonificationPreset): void {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const scale = Math.max(0.68, Math.min(1.3, w / 640));
    const pad = Math.round(8 * scale);
    const font = Math.max(7, Math.round(9 * scale));
    const line = Math.round(font * 1.45);
    ctx.font = `600 ${font}px "IBM Plex Mono", "Consolas", monospace`;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;

    const nodes = resolveChain(preset);
    const maxRows = Math.max(1, Math.min(nodes.length, Math.floor((h * 0.38 - pad * 2 - line) / line)));
    const rows = nodes.slice(0, maxRows).map((entry, index) => {
      const name = entry.kind === 'audio'
        ? FILTER_DESCRIPTORS[entry.cfg.type]?.name ?? entry.cfg.type
        : VIDEO_FILTER_DESCRIPTORS[entry.cfg.type]?.name ?? entry.cfg.type;
      const kind = entry.kind === 'audio' ? 'A' : 'V';
      return `${String(index + 1).padStart(2, '0')} ${kind} ${entry.cfg.enabled ? '>' : '-'} ${name}`;
    });
    if (nodes.length > maxRows && rows.length) rows[rows.length - 1] = `… +${nodes.length - maxRows} MODULES`;
    const maxTextWidth = Math.min(Math.round(w * 0.44), Math.round(w * 0.5));
    const pipelineWidth = Math.min(maxTextWidth, Math.max(Math.round(w * 0.28), ...rows.map(row => Math.ceil(ctx.measureText(row).width + pad * 2))));
    const pipelineHeight = pad * 2 + line * (rows.length + 1);
    const left = pad;
    const bottom = h - pad;
    this.panel(left, bottom - pipelineHeight, pipelineWidth, pipelineHeight, 'rgba(5, 8, 5, 0.52)');
    ctx.fillStyle = '#c8d665';
    ctx.fillText('PIPE / A→V', left + pad, bottom - pipelineHeight + pad + line / 2);
    rows.forEach((row, index) => {
      const y = bottom - pipelineHeight + pad + line * (index + 1.5);
      ctx.fillStyle = nodes[index]?.cfg.enabled ? '#d5dda0' : '#7d8568';
      ctx.fillText(this.fit(row, maxTextWidth - pad * 2), left + pad, y);
    });

    const graphWidth = Math.min(Math.round(w * 0.36), Math.round(w - pad * 2));
    const graphHeight = Math.max(Math.round(h * 0.16), Math.round(58 * scale));
    const x = w - pad - graphWidth;
    const y = h - pad - graphHeight;
    this.panel(x, y, graphWidth, graphHeight, 'rgba(5, 8, 5, 0.50)');
    ctx.fillStyle = '#c8d665';
    ctx.fillText('SCOPE / RAW · OUT', x + pad, y + pad + line / 2);
    const graphTop = y + pad + line;
    const graphBottom = h - pad - pad;
    this.wave(this.rawSamples, x + pad, graphTop, graphWidth - pad * 2, graphBottom - graphTop, 'rgba(212, 163, 115, 0.85)');
    this.wave(this.outputSamples, x + pad, graphTop, graphWidth - pad * 2, graphBottom - graphTop, '#c8d665');
  }

  private panel(x: number, y: number, w: number, h: number, fill: string): void {
    this.ctx.fillStyle = fill;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.strokeStyle = 'rgba(200, 214, 101, 0.68)';
    this.ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
  }

  private wave(samples: ArrayLike<number>, x: number, y: number, w: number, h: number, color: string): void {
    if (!samples.length || w <= 0 || h <= 0) return;
    const ctx = this.ctx;
    const mid = y + h / 2;
    const amplitude = h * 0.44;
    ctx.beginPath();
    ctx.moveTo(x, mid);
    for (let i = 0; i < w; i++) {
      const sample = Number(samples[Math.floor(i * samples.length / w)] ?? 0);
      const normalized = Math.max(-1, Math.min(1, sample > 1 || sample < -1 ? (sample - 128) / 128 : sample));
      ctx.lineTo(x + i, mid - normalized * amplitude);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  private fit(text: string, width: number): string {
    if (this.ctx.measureText(text).width <= width) return text;
    let result = text;
    while (result.length > 4 && this.ctx.measureText(`${result.slice(0, -1)}…`).width > width) result = result.slice(0, -1);
    return `${result.slice(0, -1)}…`;
  }
}
