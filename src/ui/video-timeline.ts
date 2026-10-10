// Analog Hardware Video Timeline & A-B Loop Controller
// Implements Sound Devices / Eurorack studio aesthetic for video playback and boundary trimming

export interface VideoTimelineOptions {
  onSeek: (timeSeconds: number) => void;
  onRangeChange: (startSeconds: number, endSeconds: number) => void;
  onTogglePlayPause: () => void;
}

export class VideoTimeline {
  private video: HTMLVideoElement | null = null;
  private duration = 0;
  private loopStart = 0;
  private loopEnd = 0;
  private currentTime = 0;
  private isPlaying = true;

  // DOM elements
  private dockEl: HTMLElement | null = null;
  private railEl: HTMLElement | null = null;
  private graduationsEl: HTMLElement | null = null;
  private dimmedLeftEl: HTMLElement | null = null;
  private dimmedRightEl: HTMLElement | null = null;
  private loopWindowEl: HTMLElement | null = null;
  private handleInEl: HTMLElement | null = null;
  private handleOutEl: HTMLElement | null = null;
  private playheadEl: HTMLElement | null = null;

  private posReadoutEl: HTMLElement | null = null;
  private durReadoutEl: HTMLElement | null = null;
  private inReadoutEl: HTMLElement | null = null;
  private outReadoutEl: HTMLElement | null = null;
  private playBtnEl: HTMLButtonElement | null = null;
  private playIconEl: HTMLElement | null = null;
  private resetBtnEl: HTMLButtonElement | null = null;
  private loopLedEl: HTMLElement | null = null;
  private loopLabelEl: HTMLElement | null = null;

  // Dragging state
  private activeDrag: 'in' | 'out' | 'playhead' | null = null;

  constructor(private opts: VideoTimelineOptions) {
    this.bindDom();
  }

  private bindDom(): void {
    this.dockEl = document.getElementById('video-timeline-dock');
    this.railEl = document.getElementById('timeline-rail');
    this.graduationsEl = document.getElementById('timeline-graduations');
    this.dimmedLeftEl = document.getElementById('timeline-dimmed-left');
    this.dimmedRightEl = document.getElementById('timeline-dimmed-right');
    this.loopWindowEl = document.getElementById('timeline-loop-window');
    this.handleInEl = document.getElementById('timeline-handle-in');
    this.handleOutEl = document.getElementById('timeline-handle-out');
    this.playheadEl = document.getElementById('timeline-playhead');

    this.posReadoutEl = document.getElementById('timeline-pos-readout');
    this.durReadoutEl = document.getElementById('timeline-dur-readout');
    this.inReadoutEl = document.getElementById('timeline-in-readout');
    this.outReadoutEl = document.getElementById('timeline-out-readout');
    this.playBtnEl = document.getElementById('timeline-btn-play') as HTMLButtonElement;
    this.playIconEl = document.getElementById('timeline-play-icon');
    this.resetBtnEl = document.getElementById('timeline-btn-reset-loop') as HTMLButtonElement;
    this.loopLedEl = document.getElementById('timeline-loop-led');
    this.loopLabelEl = document.getElementById('timeline-loop-label');

    this.initEvents();
  }

  private initEvents(): void {
    if (this.playBtnEl) {
      this.playBtnEl.onclick = (e) => {
        e.stopPropagation();
        this.opts.onTogglePlayPause();
      };
    }

    if (this.resetBtnEl) {
      this.resetBtnEl.onclick = (e) => {
        e.stopPropagation();
        this.resetLoopToFull();
      };
    }

    // Handle drag on In marker
    if (this.handleInEl) {
      this.handleInEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.startDrag('in', e);
      });
      this.handleInEl.addEventListener('keydown', (e) => this.handleKeyStep('in', e));
    }

    // Handle drag on Out marker
    if (this.handleOutEl) {
      this.handleOutEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.startDrag('out', e);
      });
      this.handleOutEl.addEventListener('keydown', (e) => this.handleKeyStep('out', e));
    }

    // Playhead and Track clicking / scrubbing
    if (this.railEl) {
      this.railEl.addEventListener('pointerdown', (e) => {
        if (e.target === this.handleInEl || e.target === this.handleOutEl) return;
        if ((e.target as HTMLElement).closest('.timeline-handle')) return;
        e.preventDefault();
        this.seekFromPointerEvent(e);
        this.startDrag('playhead', e);
      });
    }

    // Window level pointer move & up
    window.addEventListener('pointermove', (e) => {
      if (!this.activeDrag || this.duration <= 0) return;
      e.preventDefault();
      const posRatio = this.calcRatioFromPointer(e);
      const targetSec = posRatio * this.duration;

      if (this.activeDrag === 'in') {
        const maxIn = Math.max(0, this.loopEnd - 0.05);
        this.loopStart = Math.max(0, Math.min(maxIn, targetSec));
        if (this.currentTime < this.loopStart) {
          this.currentTime = this.loopStart;
          this.opts.onSeek(this.currentTime);
        }
        this.opts.onRangeChange(this.loopStart, this.loopEnd);
        this.render();
      } else if (this.activeDrag === 'out') {
        const minOut = Math.min(this.duration, this.loopStart + 0.05);
        this.loopEnd = Math.max(minOut, Math.min(this.duration, targetSec));
        if (this.currentTime > this.loopEnd) {
          this.currentTime = this.loopStart;
          this.opts.onSeek(this.currentTime);
        }
        this.opts.onRangeChange(this.loopStart, this.loopEnd);
        this.render();
      } else if (this.activeDrag === 'playhead') {
        this.currentTime = Math.max(0, Math.min(this.duration, targetSec));
        this.opts.onSeek(this.currentTime);
        this.render();
      }
    });

    window.addEventListener('pointerup', () => {
      if (this.activeDrag) {
        this.activeDrag = null;
        document.body.classList.remove('timeline-dragging');
      }
    });
    window.addEventListener('pointercancel', () => {
      this.activeDrag = null;
      document.body.classList.remove('timeline-dragging');
    });
  }

  private startDrag(type: 'in' | 'out' | 'playhead', e: PointerEvent): void {
    this.activeDrag = type;
    document.body.classList.add('timeline-dragging');
    try {
      (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
    } catch (_) {}
  }

  private calcRatioFromPointer(e: PointerEvent): number {
    if (!this.railEl) return 0;
    const rect = this.railEl.getBoundingClientRect();
    if (rect.width <= 0) return 0;
    const rawX = e.clientX - rect.left;
    return Math.max(0, Math.min(1, rawX / rect.width));
  }

  private seekFromPointerEvent(e: PointerEvent): void {
    if (this.duration <= 0) return;
    const ratio = this.calcRatioFromPointer(e);
    this.currentTime = ratio * this.duration;
    this.opts.onSeek(this.currentTime);
    this.render();
  }

  private handleKeyStep(target: 'in' | 'out', e: KeyboardEvent): void {
    if (this.duration <= 0) return;
    const step = e.shiftKey ? 1.0 : 0.1;
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (target === 'in') {
        this.loopStart = Math.max(0, this.loopStart - step);
      } else {
        this.loopEnd = Math.max(this.loopStart + 0.05, this.loopEnd - step);
      }
      this.opts.onRangeChange(this.loopStart, this.loopEnd);
      this.render();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      if (target === 'in') {
        this.loopStart = Math.min(this.loopEnd - 0.05, this.loopStart + step);
      } else {
        this.loopEnd = Math.min(this.duration, this.loopEnd + step);
      }
      this.opts.onRangeChange(this.loopStart, this.loopEnd);
      this.render();
    }
  }

  public attachVideo(video: HTMLVideoElement): void {
    this.video = video;
    const dur = video.duration;
    this.duration = !isNaN(dur) && dur > 0 ? dur : 0;
    this.loopStart = 0;
    this.loopEnd = this.duration;
    this.currentTime = video.currentTime || 0;
    this.isPlaying = !video.paused;

    this.renderGraduations();
    this.render();
    this.show();
  }

  public detachVideo(): void {
    this.video = null;
    this.duration = 0;
    this.loopStart = 0;
    this.loopEnd = 0;
    this.currentTime = 0;
    this.hide();
  }

  public show(): void {
    this.dockEl?.classList.remove('hidden');
  }

  public hide(): void {
    this.dockEl?.classList.add('hidden');
  }

  public resetLoopToFull(): void {
    if (this.duration <= 0) return;
    this.loopStart = 0;
    this.loopEnd = this.duration;
    this.opts.onRangeChange(this.loopStart, this.loopEnd);
    this.render();
  }

  public getLoopRange(): { start: number; end: number } {
    return {
      start: this.loopStart,
      end: this.loopEnd > this.loopStart ? this.loopEnd : (this.duration || 1),
    };
  }

  public setLoopRange(start: number, end: number): void {
    this.loopStart = Math.max(0, Math.min(this.duration, start));
    this.loopEnd = Math.max(this.loopStart + 0.05, Math.min(this.duration, end));
    this.render();
  }

  public getVideo(): HTMLVideoElement | null {
    return this.video;
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public setPlaying(playing: boolean): void {
    this.isPlaying = playing;
    if (this.playIconEl) {
      this.playIconEl.textContent = playing ? '⏸' : '▶';
    }
    if (this.playBtnEl) {
      this.playBtnEl.title = playing ? 'Pause Video (Space)' : 'Play Video (Space)';
    }
  }

  public updatePlayhead(timeSec: number): void {
    this.currentTime = timeSec;
    if (!this.activeDrag) {
      this.renderPlayheadOnly();
    }
  }

  /**
   * Checks whether the current playback time breached the A-B loop boundaries.
   * Returns corrected time in seconds if wrapped, or null if within range.
   */
  public checkLoopBoundaries(timeSec: number): number | null {
    if (this.duration <= 0) return null;
    const start = this.loopStart;
    const end = this.loopEnd > start ? this.loopEnd : this.duration;

    // Check if reached or exceeded the end boundary
    if (timeSec >= end) {
      return start;
    }
    // Check if seeked prior to start boundary
    if (timeSec < start) {
      return start;
    }
    return null;
  }

  private renderPlayheadOnly(): void {
    if (this.duration <= 0) return;
    const curRatio = Math.max(0, Math.min(1, this.currentTime / this.duration));
    const curPercent = curRatio * 100;

    if (this.playheadEl) {
      this.playheadEl.style.left = `${curPercent}%`;
    }
    if (this.posReadoutEl) {
      this.posReadoutEl.textContent = this.formatTime(this.currentTime);
    }
  }

  public render(): void {
    if (this.duration <= 0) return;

    const inRatio = Math.max(0, Math.min(1, this.loopStart / this.duration));
    const outRatio = Math.max(0, Math.min(1, this.loopEnd / this.duration));
    const curRatio = Math.max(0, Math.min(1, this.currentTime / this.duration));

    const inPercent = inRatio * 100;
    const outPercent = outRatio * 100;
    const curPercent = curRatio * 100;

    // Left dimmed block
    if (this.dimmedLeftEl) {
      this.dimmedLeftEl.style.left = '0%';
      this.dimmedLeftEl.style.width = `${inPercent}%`;
    }

    // Active loop window
    if (this.loopWindowEl) {
      this.loopWindowEl.style.left = `${inPercent}%`;
      this.loopWindowEl.style.width = `${Math.max(0, outPercent - inPercent)}%`;
    }

    // Right dimmed block
    if (this.dimmedRightEl) {
      this.dimmedRightEl.style.left = `${outPercent}%`;
      this.dimmedRightEl.style.width = `${Math.max(0, 100 - outPercent)}%`;
    }

    // Marker A (In)
    if (this.handleInEl) {
      this.handleInEl.style.left = `${inPercent}%`;
      this.handleInEl.setAttribute('aria-valuenow', this.loopStart.toFixed(2));
    }

    // Marker B (Out)
    if (this.handleOutEl) {
      this.handleOutEl.style.left = `${outPercent}%`;
      this.handleOutEl.setAttribute('aria-valuenow', this.loopEnd.toFixed(2));
    }

    // Playhead
    if (this.playheadEl) {
      this.playheadEl.style.left = `${curPercent}%`;
    }

    // Readouts
    if (this.posReadoutEl) this.posReadoutEl.textContent = this.formatTime(this.currentTime);
    if (this.durReadoutEl) this.durReadoutEl.textContent = this.formatTime(this.duration);
    if (this.inReadoutEl) this.inReadoutEl.textContent = this.formatTime(this.loopStart);
    if (this.outReadoutEl) this.outReadoutEl.textContent = this.formatTime(this.loopEnd);

    // Is active loop sub-region?
    const isTrimmed = inRatio > 0.005 || outRatio < 0.995;
    if (this.loopLedEl) {
      this.loopLedEl.classList.toggle('active', isTrimmed);
    }
    if (this.loopLabelEl) {
      this.loopLabelEl.textContent = isTrimmed ? 'LOOP A-B' : 'LOOP ALL';
    }
  }

  private renderGraduations(): void {
    if (!this.graduationsEl || this.duration <= 0) return;
    this.graduationsEl.innerHTML = '';

    // Generate ~16 tick marks across the timeline
    const count = 16;
    for (let i = 0; i <= count; i++) {
      const tick = document.createElement('span');
      tick.className = i % 4 === 0 ? 'timeline-tick tick-major' : 'timeline-tick';
      tick.style.left = `${(i / count) * 100}%`;
      this.graduationsEl.appendChild(tick);
    }
  }

  private formatTime(sec: number): string {
    if (isNaN(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const cs = Math.floor((sec % 1) * 100);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }
}
