// Analog Telemetry Reticle HUD & Oscilloscope Overlay
// Inspired by CRT radar tubes, aerospace avionics HUDs, and GD&T drafting schematics (Ref 1, Ref 2, Ref 4, Ref 5)

export interface HudTelemetryData {
  fps?: number;
  sampleRate?: number;
  width?: number;
  height?: number;
  audioSamples?: Float32Array;
  scopeSamples?: Float32Array;
  rawAudioSamples?: Float32Array;
  analyser?: AnalyserNode | null;
  seed?: number;
}

export class HudOverlay {
  private container: HTMLElement;
  private hudCanvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Offscreen persistence buffer for analog CRT electron decay
  private trailCanvas: HTMLCanvasElement;
  private trailCtx: CanvasRenderingContext2D;

  // DOM Telemetry & Meter Elements
  private valBus: HTMLElement | null = document.getElementById('hud-val-bus');
  private valPeak: HTMLElement | null = document.getElementById('hud-val-peak');
  private valRms: HTMLElement | null = document.getElementById('hud-val-rms');
  private valSeed: HTMLElement | null = document.getElementById('hud-val-seed');
  private meterSegsL: HTMLElement[] = [];
  private meterSegsR: HTMLElement[] = [];
  private lastActiveCountL: number = -1;
  private lastActiveCountR: number = -1;
  private lastDomUpdate: number = 0;
  private renderDurations: number[] = [];

  private enabled: boolean = false;
  private dpr: number = 1;
  private resizeObserver: ResizeObserver | null = null;
  private startTime: number = performance.now();
  private scanPhase: number = 0;

  // Internal RAF loop state
  private rafId: number | null = null;
  private lastRenderAt = Number.NEGATIVE_INFINITY;
  private latestData: HudTelemetryData = {};

  constructor(
    container: HTMLElement,
    hudCanvas: HTMLCanvasElement,
    enabledOverride?: boolean
  ) {
    this.container = container;
    this.hudCanvas = hudCanvas;
    this.ctx = this.hudCanvas.getContext('2d', { alpha: true })!;

    this.trailCanvas = document.createElement('canvas');
    this.trailCtx = this.trailCanvas.getContext('2d', { alpha: true, willReadFrequently: true })!;

    this.initDefaultState(enabledOverride);
    this.initSegmentedMeters();
    this.handleResize();

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(this.container);
    window.addEventListener('resize', () => this.handleResize());

    if (this.enabled) {
      this.startLoop();
    }
  }

  private initDefaultState(enabledOverride?: boolean): void {
    if(enabledOverride!==undefined){this.enabled=enabledOverride;return;}
    const isMobile =
      window.innerWidth <= 900 ||
      /iPhone|iPad|iPod|Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

    if (isMobile) {
      // HUD telemetry oscilloscope is strictly housed within SCOPE tab on mobile; default OFF
      this.enabled = false;
    } else {
      const saved = localStorage.getItem('sonification_hud_enabled');
      this.enabled = saved !== null ? saved === 'true' : true;
    }
  }

  private initSegmentedMeters(): void {
    const barL = document.getElementById('meter-segments-l');
    const barR = document.getElementById('meter-segments-r');
    const count = 20;

    if (barL && barL.children.length === 0) {
      this.meterSegsL = [];
      for (let i = 0; i < count; i++) {
        const seg = document.createElement('div');
        seg.className = 'seg';
        barL.appendChild(seg);
        this.meterSegsL.push(seg);
      }
    }

    if (barR && barR.children.length === 0) {
      this.meterSegsR = [];
      for (let i = 0; i < count; i++) {
        const seg = document.createElement('div');
        seg.className = 'seg';
        barR.appendChild(seg);
        this.meterSegsR.push(seg);
      }
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public toggle(): boolean {
    this.setEnabled(!this.enabled);
    return this.enabled;
  }

  public setEnabled(val: boolean): void {
    this.enabled = val;
    localStorage.setItem('sonification_hud_enabled', String(val));
    if (this.enabled) {
      this.handleResize();
      this.startLoop();
    } else {
      this.stopLoop();
      this.clear();
    }
  }

  public resize(): void {
    this.handleResize();
  }

  public setTelemetryData(data: Partial<HudTelemetryData>): void {
    Object.assign(this.latestData, data);
  }

  public getRenderTimingSummary(): { count: number; p50: number; p95: number; p99: number } {
    const sorted=[...this.renderDurations].sort((a,b)=>a-b);
    const percentile=(p:number)=>sorted.length?sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]:0;
    return {count:sorted.length,p50:percentile(0.5),p95:percentile(0.95),p99:percentile(0.99)};
  }

  public resetRenderTimings(): void { this.renderDurations=[]; }

  private startLoop(): void {
    if (this.rafId !== null) return;
    const tick = (now: number) => {
      if (!this.enabled) {
        this.rafId = null;
        return;
      }
      if (now - this.lastRenderAt >= 1000 / 30) {
        this.render(this.latestData);
        this.lastRenderAt = now;
      }
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public clear(): void {
    this.ctx.clearRect(0, 0, this.hudCanvas.width, this.hudCanvas.height);
    this.trailCtx.clearRect(0, 0, this.trailCanvas.width, this.trailCanvas.height);
  }

  private handleResize(): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) return;
    const w = Math.max(1, Math.floor(rect.width * this.dpr));
    const h = Math.max(1, Math.floor(rect.height * this.dpr));

    if (this.hudCanvas.width !== w || this.hudCanvas.height !== h) {
      this.hudCanvas.width = w;
      this.hudCanvas.height = h;
      this.trailCanvas.width = w;
      this.trailCanvas.height = h;
      this.trailCtx.clearRect(0, 0, w, h);
    }
  }

  public render(data: HudTelemetryData = {}): void {
    if (!this.enabled) return;
    const renderStarted=performance.now();

    const w = this.hudCanvas.width;
    const h = this.hudCanvas.height;
    if (w <= 0 || h <= 0) return;

    // Active frame bounds inside dedicated CRT bay
    const padX = Math.round(14 * this.dpr);
    const padY = Math.round(18 * this.dpr);
    const imgX = padX;
    const imgY = padY;
    const imgW = w - padX * 2;
    const imgH = h - padY * 2;

    // Primary Render Pass
    this.ctx.clearRect(0, 0, w, h);

    // 1. Draw Static / Semi-Static Reticles & Framing
    this.drawReticleCalibration(imgX, imgY, imgW, imgH, data);

    // 2. Phosphor Persistence Decay Step for Dynamic Waveforms
    this.updatePhosphorDecay(w, h);

    // 3. Draw Dual Electron Beam Oscilloscope (Raw Input vs Filtered Output)
    this.drawDualWaveforms(imgX, imgY, imgW, imgH, data);

    // 4. Composite Decay Trail Buffer onto Main HUD Canvas
    this.ctx.save();
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.drawImage(this.trailCanvas, 0, 0);
    this.ctx.restore();

    // 5. Draw Dynamic Scanning Playhead Crosshair & Live Telemetry
    this.drawTrackingPlayhead(imgX, imgY, imgW, imgH, data);

    // 6. Update Matrix & Segmented LED Meters
    this.updateDomTelemetry(data);
    this.renderDurations.push(performance.now()-renderStarted);
    if(this.renderDurations.length>10000)this.renderDurations.splice(0,this.renderDurations.length-10000);
  }

  // Ref 1: Corner brackets, concentric calibration rings, millimeter ticks
  private drawReticleCalibration(
    x: number,
    y: number,
    w: number,
    h: number,
    data: HudTelemetryData
  ): void {
    const ctx = this.ctx;
    ctx.save();

    const cx = x + w / 2;
    const cy = y + h / 2;

    // Colors from Design Protocol
    const phosphorWhite = 'rgba(236, 232, 220, 0.75)';
    const sageTick = 'rgba(158, 167, 150, 0.55)';
    const accentPhosphor = '#c8d665';

    // -------------------------------------------------------------
    // A. Corner Bracket Bounding Box [   ] (Ref 1 & Ref 2)
    // -------------------------------------------------------------
    const bracketLen = Math.min(22 * this.dpr, Math.min(w, h) * 0.14);
    ctx.lineWidth = 1 * this.dpr;
    ctx.strokeStyle = phosphorWhite;

    // Top-Left [
    ctx.beginPath();
    ctx.moveTo(x, y + bracketLen);
    ctx.lineTo(x, y);
    ctx.lineTo(x + bracketLen, y);
    ctx.stroke();

    // Top-Right ]
    ctx.beginPath();
    ctx.moveTo(x + w - bracketLen, y);
    ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + bracketLen);
    ctx.stroke();

    // Bottom-Left [
    ctx.beginPath();
    ctx.moveTo(x, y + h - bracketLen);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x + bracketLen, y + h);
    ctx.stroke();

    // Bottom-Right ]
    ctx.beginPath();
    ctx.moveTo(x + w - bracketLen, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + w, y + h - bracketLen);
    ctx.stroke();

    // -------------------------------------------------------------
    // B. Functional Oscilloscope Amplitude & Time Division Graticule
    // -------------------------------------------------------------
    const ampScale = h * 0.38; // Matches exact waveform vertical scale
    const gridDim = 'rgba(158, 167, 150, 0.14)';
    const gridZero = 'rgba(158, 167, 150, 0.35)';

    ctx.lineWidth = 1 * this.dpr;

    // Amplitude Horizontal Reference Grid Lines (+1.0, +0.5, 0.0, -0.5, -1.0)
    const levels = [
      { yPos: cy - ampScale, label: '+1.0', dashed: false },
      { yPos: cy - ampScale * 0.5, label: '+0.5', dashed: true },
      { yPos: cy, label: ' 0.0', dashed: false },
      { yPos: cy + ampScale * 0.5, label: '-0.5', dashed: true },
      { yPos: cy + ampScale, label: '-1.0', dashed: false },
    ];

    ctx.font = `${Math.round(7.5 * this.dpr)}px "JetBrains Mono", monospace`;
    ctx.textBaseline = 'middle';

    for (const lvl of levels) {
      ctx.strokeStyle = lvl.dashed ? gridDim : gridZero;
      if (lvl.dashed) {
        ctx.setLineDash([2 * this.dpr, 4 * this.dpr]);
      } else {
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.moveTo(x + 4 * this.dpr, lvl.yPos);
      ctx.lineTo(x + w - 4 * this.dpr, lvl.yPos);
      ctx.stroke();

      // Amplitude level tag on right margin
      ctx.fillStyle = 'rgba(158, 167, 150, 0.45)';
      ctx.textAlign = 'right';
      ctx.fillText(lvl.label, x + w - 6 * this.dpr, lvl.yPos - 6 * this.dpr);
    }
    ctx.setLineDash([]);

    // Vertical Time Division Lines (4 divisions across the buffer)
    const divisions = 4;
    ctx.strokeStyle = gridDim;
    ctx.setLineDash([2 * this.dpr, 4 * this.dpr]);
    for (let d = 1; d < divisions; d++) {
      const divX = x + (w * d) / divisions;
      ctx.beginPath();
      ctx.moveTo(divX, y + 4 * this.dpr);
      ctx.lineTo(divX, y + h - 4 * this.dpr);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    // Time ticks along the zero datum axis (cy)
    ctx.strokeStyle = sageTick;
    const tickStep = 20 * this.dpr;
    const tickCount = Math.floor((w * 0.46) / tickStep);
    const tickSize = 3 * this.dpr;

    for (let i = -tickCount; i <= tickCount; i++) {
      if (i === 0) continue;
      const tx = cx + i * tickStep;
      if (tx >= x + 8 && tx <= x + w - 8) {
        ctx.beginPath();
        ctx.moveTo(tx, cy - tickSize);
        ctx.lineTo(tx, cy + tickSize);
        ctx.stroke();
      }
    }

    // Center Zero Crosshair Reticle +
    const crossSize = 6 * this.dpr;
    ctx.strokeStyle = accentPhosphor;
    ctx.lineWidth = 1.2 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(cx - crossSize, cy);
    ctx.lineTo(cx + crossSize, cy);
    ctx.moveTo(cx, cy - crossSize);
    ctx.lineTo(cx, cy + crossSize);
    ctx.stroke();

    // Center focal dot
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5 * this.dpr, 0, Math.PI * 2);
    ctx.fill();

    // -------------------------------------------------------------
    // D. Telemetry Silkscreen Labels & GD&T Feature Control (Ref 1 & 2)
    // -------------------------------------------------------------
    ctx.font = `${Math.round(8.5 * this.dpr)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = phosphorWhite;
    ctx.textBaseline = 'top';

    // Top-Left: Timecode & Facility ID
    const elapsed = (performance.now() - this.startTime) / 1000;
    const hh = String(Math.floor(elapsed / 3600)).padStart(2, '0');
    const mm = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0');
    const ss = String(Math.floor(elapsed % 60)).padStart(2, '0');
    const ff = String(Math.floor((elapsed * 30) % 30)).padStart(2, '0');
    ctx.fillText(`T:${hh}:${mm}:${ss}:${ff}`, x + 2 * this.dpr, y - 14 * this.dpr);

    // Top-Right: System Status
    ctx.textAlign = 'right';
    ctx.fillStyle = accentPhosphor;
    ctx.fillText(`SYS.OPL LIVE`, x + w - 2 * this.dpr, y - 14 * this.dpr);

    // Bottom-Left: GD&T Feature Frame
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(158, 167, 150, 0.7)';
    const resText = data.width && data.height ? `${data.width}×${data.height}` : `640×480`;
    ctx.fillText(`[ 0.14 | A ]  ${resText}`, x + 2 * this.dpr, y + h + 4 * this.dpr);

    // Bottom-Right: Calibrated Scale
    ctx.textAlign = 'right';
    ctx.fillText(`SCALE: 1:1.0`, x + w - 2 * this.dpr, y + h + 4 * this.dpr);

    ctx.restore();
  }

  // Ref 1: Phosphor persistence decay (electrons fade across 2-3 frames like a CRT)
  private updatePhosphorDecay(w: number, h: number): void {
    const tCtx = this.trailCtx;
    tCtx.save();
    tCtx.globalCompositeOperation = 'destination-out';
    tCtx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    tCtx.fillRect(0, 0, w, h);
    tCtx.restore();
  }

  // Dual-Beam Oscilloscope: Raw Transduction Input vs Filtered Output
  private drawDualWaveforms(
    x: number,
    y: number,
    w: number,
    h: number,
    data: HudTelemetryData
  ): void {
    const tCtx = this.trailCtx;
    tCtx.save();

    const rawSamples = data.rawAudioSamples;
    const postSamples = data.scopeSamples ?? data.audioSamples;
    const cy = y + h / 2;
    const ampScale = h * 0.38;

    // -------------------------------------------------------------
    // 1. WAVE 1: RAW FOOTAGE TRANSDUCTION (Before DSP Filters)
    // Muted Bone-White / Slate Electron Beam with subtle dashed hairline
    // -------------------------------------------------------------
    if (rawSamples && rawSamples.length > 0) {
      tCtx.strokeStyle = 'rgba(236, 232, 220, 0.40)';
      tCtx.lineWidth = 1.0 * this.dpr;
      tCtx.setLineDash([4 * this.dpr, 3 * this.dpr]);
      tCtx.beginPath();

      const step = Math.max(1, Math.floor(rawSamples.length / 256));
      const totalPoints = Math.floor(rawSamples.length / step);
      const dx = w / totalPoints;

      for (let i = 0; i < totalPoints; i++) {
        const sampleIdx = i * step;
        const val = rawSamples[sampleIdx] || 0;
        const px = x + i * dx;
        const py = cy + val * ampScale;

        if (i === 0) {
          tCtx.moveTo(px, py);
        } else {
          tCtx.lineTo(px, py);
        }
      }
      tCtx.stroke();
      tCtx.setLineDash([]);
    }

    // -------------------------------------------------------------
    // 2. WAVE 2: POST-DSP OUTPUT STREAM (After DSP Filters)
    // High-energy Warm Phosphor Chartreuse with persistence trail
    // -------------------------------------------------------------
    if (postSamples && postSamples.length > 0) {
      tCtx.strokeStyle = '#c8d665';
      tCtx.lineWidth = 1.4 * this.dpr;
      tCtx.beginPath();

      const step = Math.max(1, Math.floor(postSamples.length / 256));
      const totalPoints = Math.floor(postSamples.length / step);
      const dx = w / totalPoints;

      for (let i = 0; i < totalPoints; i++) {
        const sampleIdx = i * step;
        const val = postSamples[sampleIdx] || 0;
        const px = x + i * dx;
        const py = cy + val * ampScale;

        if (i === 0) {
          tCtx.moveTo(px, py);
        } else {
          tCtx.lineTo(px, py);
        }
      }
      tCtx.stroke();
    }

    // Dual Wave Legend (Top Inset of Oscillogram)
    tCtx.font = `${Math.round(8 * this.dpr)}px "JetBrains Mono", monospace`;
    tCtx.textBaseline = 'top';

    // Raw input legend tag
    tCtx.fillStyle = 'rgba(236, 232, 220, 0.55)';
    tCtx.fillText(`╌╌ [ RAW IN ]`, x + 6 * this.dpr, y + 6 * this.dpr);

    // Filtered output legend tag
    tCtx.fillStyle = '#c8d665';
    tCtx.fillText(`── [ POST DSP ]`, x + 88 * this.dpr, y + 6 * this.dpr);

    tCtx.restore();
  }

  // Ref 1: Dynamic Center Crosshair + Tracking Scanning Playhead
  private drawTrackingPlayhead(
    x: number,
    y: number,
    w: number,
    h: number,
    _data: HudTelemetryData
  ): void {
    const ctx = this.ctx;
    ctx.save();

    this.scanPhase = (this.scanPhase + 0.0035) % 1.0;
    const playheadX = x + this.scanPhase * w;
    const accentPhosphor = '#c8d665';

    // Vertical Playhead Tracking Hairline
    ctx.strokeStyle = 'rgba(200, 214, 101, 0.45)';
    ctx.lineWidth = 1 * this.dpr;
    ctx.setLineDash([3 * this.dpr, 3 * this.dpr]);
    ctx.beginPath();
    ctx.moveTo(playheadX, y);
    ctx.lineTo(playheadX, y + h);
    ctx.stroke();
    ctx.setLineDash([]);

    // Tracking Scanning Reticle Crosshair + Coordinates
    const targetY = y + h * 0.5 + Math.sin(this.scanPhase * Math.PI * 4) * (h * 0.15);
    const reticleSize = 5 * this.dpr;

    ctx.strokeStyle = accentPhosphor;
    ctx.lineWidth = 1.2 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(playheadX - reticleSize, targetY);
    ctx.lineTo(playheadX + reticleSize, targetY);
    ctx.moveTo(playheadX, targetY - reticleSize);
    ctx.lineTo(playheadX, targetY + reticleSize);
    ctx.stroke();

    // Live Scan Coordinates Tag
    ctx.font = `${Math.round(8 * this.dpr)}px "JetBrains Mono", monospace`;
    ctx.fillStyle = accentPhosphor;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const sampleVal = Math.floor(this.scanPhase * 44100);
    ctx.fillText(`SMP:${sampleVal.toString().padStart(5, '0')}`, playheadX + 4 * this.dpr, targetY - 4 * this.dpr);

    ctx.restore();
  }

  // Update DOM Telemetry Matrix (Ref 2 & Ref 4) and Segmented LED Meters
  private updateDomTelemetry(data: HudTelemetryData): void {
    const samples = data.audioSamples;
    let peak = 0.001;
    let rms = 0.001;

    if (samples && samples.length > 0) {
      let sum = 0;
      const count = Math.min(samples.length, 512);
      for (let i = 0; i < count; i++) {
        const val = Math.abs(samples[i]);
        if (val > peak) peak = val;
        sum += val * val;
      }
      rms = Math.sqrt(sum / count);
    }

    const now = performance.now();
    if (now - this.lastDomUpdate >= 80) {
      this.lastDomUpdate = now;
      const peakDb = Math.max(-60, 20 * Math.log10(peak));

      if (this.valBus && data.sampleRate) {
        this.valBus.textContent = `${(data.sampleRate / 1000).toFixed(1)} kHz`;
      }
      if (this.valPeak) {
        this.valPeak.textContent = `${peakDb > -0.5 ? 'CLIP' : peakDb.toFixed(1) + ' dB'}`;
        this.valPeak.style.color = peakDb > -0.5 ? 'var(--accent-red)' : 'var(--text-primary)';
      }
      if (this.valRms) {
        this.valRms.textContent = rms.toFixed(2);
      }
      if (this.valSeed && data.seed) {
        this.valSeed.textContent = String(data.seed);
      }
    }

    // Segmented LED Meters (Ref 2) - only mutate DOM when active segment count changes
    const activeCountL = Math.min(20, Math.floor(Math.min(1.0, peak * 1.4) * 20));
    const activeCountR = Math.min(20, Math.floor(Math.min(1.0, rms * 2.2) * 20));

    if (activeCountL !== this.lastActiveCountL) {
      this.lastActiveCountL = activeCountL;
      this.updateSegmentList(this.meterSegsL, activeCountL);
    }
    if (activeCountR !== this.lastActiveCountR) {
      this.lastActiveCountR = activeCountR;
      this.updateSegmentList(this.meterSegsR, activeCountR);
    }
  }

  private updateSegmentList(segs: HTMLElement[], activeCount: number): void {
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      if (i < activeCount) {
        if (i >= 18) {
          seg.className = 'seg active-red';
        } else if (i >= 14) {
          seg.className = 'seg active-amber';
        } else {
          seg.className = 'seg active-normal';
        }
      } else {
        seg.className = 'seg';
      }
    }
  }
}
