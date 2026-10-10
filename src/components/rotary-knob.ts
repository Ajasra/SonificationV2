// Tactile Hardware Rotary Knob Component for Sonification V2
// Inspired by Eurorack synth modules, Sound Devices hardware, and laboratory gear

export interface RotaryKnobOptions {
  min: number;
  max: number;
  step?: number;
  value: number;
  defaultValue?: number;
  label: string;
  unit?: string;
  tooltip?: string;
  size?: number; // diameter in pixels (default: 46)
  onChange: (value: number) => void;
}

export class RotaryKnob {
  public readonly element: HTMLElement;
  private readonly options: RotaryKnobOptions;
  private currentValue: number;
  private isDragging = false;
  private startY = 0;
  private startVal = 0;

  // DOM elements
  private needleElement!: SVGLineElement;
  private tickLines: SVGLineElement[] = [];
  private valueDisplay!: HTMLElement;

  private static readonly START_ANGLE = -135; // degrees (7 o'clock)
  private static readonly TOTAL_ANGLE = 270;

  constructor(options: RotaryKnobOptions) {
    this.options = {
      step: options.step || (options.max - options.min > 10 ? 1 : 0.01),
      defaultValue: options.defaultValue !== undefined ? options.defaultValue : options.value,
      size: options.size || 46,
      ...options,
    };
    this.currentValue = this.clamp(this.options.value);
    this.element = this.buildElement();
    this.updateVisuals();
  }

  private clamp(val: number): number {
    return Math.max(this.options.min, Math.min(this.options.max, val));
  }

  private snapToStep(val: number): number {
    const step = this.options.step || 0.01;
    const inv = 1 / step;
    return Math.round(val * inv) / inv;
  }

  private getNormalized(): number {
    const range = this.options.max - this.options.min;
    if (range === 0) return 0;
    return (this.currentValue - this.options.min) / range;
  }

  private getAngle(): number {
    return RotaryKnob.START_ANGLE + this.getNormalized() * RotaryKnob.TOTAL_ANGLE;
  }

  private formatValue(val: number): string {
    const step = this.options.step || 0.01;
    let formatted = '';
    if (step >= 1) {
      formatted = val.toFixed(0);
    } else if (step >= 0.1) {
      formatted = val.toFixed(1);
    } else {
      formatted = val.toFixed(2);
    }
    return this.options.unit ? `${formatted} ${this.options.unit}` : formatted;
  }

  private buildElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'knob-container';
    if (this.options.tooltip) {
      container.title = this.options.tooltip;
    }

    // Label on top (PCB silkscreen style)
    const labelEl = document.createElement('div');
    labelEl.className = 'knob-label';
    labelEl.textContent = this.options.label;
    labelEl.title = this.options.tooltip || this.options.label;
    container.appendChild(labelEl);

    // Knob assembly wrapper
    const assembly = document.createElement('div');
    assembly.className = 'knob-assembly';
    if (this.options.tooltip) {
      assembly.title = this.options.tooltip;
    }
    const sz = this.options.size!;
    assembly.style.width = `${sz}px`;
    assembly.style.height = `${sz}px`;

    // SVG Dial track & tick marks
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'knob-svg');
    svg.setAttribute('viewBox', '0 0 100 100');

    // Ultra-minimal 11 hairline calibration notches
    this.tickLines = [];
    const tickCount = 11;
    for (let i = 0; i < tickCount; i++) {
      const tickNorm = i / (tickCount - 1);
      const tickAngle = (RotaryKnob.START_ANGLE + tickNorm * RotaryKnob.TOTAL_ANGLE - 90) * (Math.PI / 180);
      const rInner = 36;
      const rOuter = (i === 0 || i === tickCount - 1 || i === Math.floor(tickCount / 2)) ? 46 : 41;
      const x1 = 50 + rInner * Math.cos(tickAngle);
      const y1 = 50 + rInner * Math.sin(tickAngle);
      const x2 = 50 + rOuter * Math.cos(tickAngle);
      const y2 = 50 + rOuter * Math.sin(tickAngle);

      const tickLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      tickLine.setAttribute('x1', x1.toFixed(1));
      tickLine.setAttribute('y1', y1.toFixed(1));
      tickLine.setAttribute('x2', x2.toFixed(1));
      tickLine.setAttribute('y2', y2.toFixed(1));
      tickLine.setAttribute('class', 'knob-tick-line');
      svg.appendChild(tickLine);
      this.tickLines.push(tickLine);
    }

    // Rotating needle pointer (zero background circle, pure single vector line anchored at exact center)
    const needleLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    needleLine.setAttribute('x1', '50');
    needleLine.setAttribute('y1', '50');
    needleLine.setAttribute('x2', '50');
    needleLine.setAttribute('y2', '24');
    needleLine.setAttribute('class', 'knob-needle-line');
    svg.appendChild(needleLine);
    this.needleElement = needleLine;

    // Tiny center datum point (0.8px) for authentic instrument pivot
    const centerPoint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    centerPoint.setAttribute('cx', '50');
    centerPoint.setAttribute('cy', '50');
    centerPoint.setAttribute('r', '1.2');
    centerPoint.setAttribute('class', 'knob-pivot-dot');
    svg.appendChild(centerPoint);

    assembly.appendChild(svg);
    container.appendChild(assembly);

    // Numeric readout badge below
    this.valueDisplay = document.createElement('div');
    this.valueDisplay.className = 'knob-readout';
    this.valueDisplay.textContent = this.formatValue(this.currentValue);
    this.valueDisplay.title = 'Double-click to reset, click to type';

    // Allow user to click value display to enter manual value
    this.valueDisplay.onclick = (e) => {
      e.stopPropagation();
      const entered = prompt(`Set value for ${this.options.label}:`, String(this.currentValue));
      if (entered !== null) {
        const parsed = parseFloat(entered);
        if (!isNaN(parsed)) {
          this.setValue(parsed, true);
        }
      }
    };

    container.appendChild(this.valueDisplay);

    this.bindEvents(assembly);
    return container;
  }

  private updateVisuals(): void {
    // Exact mathematical angle in radians (-90 deg offset because 0 deg points up in dials)
    const angleDeg = this.getAngle();
    const rad = (angleDeg - 90) * (Math.PI / 180);
    const needleLength = 26;
    const nx = 50 + needleLength * Math.cos(rad);
    const ny = 50 + needleLength * Math.sin(rad);

    // Directly set needle line endpoints from center (50, 50) without transform matrix drift
    this.needleElement.setAttribute('x1', '50');
    this.needleElement.setAttribute('y1', '50');
    this.needleElement.setAttribute('x2', nx.toFixed(2));
    this.needleElement.setAttribute('y2', ny.toFixed(2));

    // Illuminate radial ticks up to current normalized value (Reference 1 tachometer)
    const norm = this.getNormalized();
    const count = this.tickLines.length;
    for (let i = 0; i < count; i++) {
      const lineNorm = i / (count - 1);
      if (lineNorm <= norm + 0.001 && this.currentValue > this.options.min) {
        this.tickLines[i].classList.add('is-active');
      } else {
        this.tickLines[i].classList.remove('is-active');
      }
    }

    this.valueDisplay.textContent = this.formatValue(this.currentValue);
  }

  private bindEvents(knobEl: HTMLElement): void {
    // Pointer drag interaction (works on both mouse & mobile touch)
    knobEl.onpointerdown = (e: PointerEvent) => {
      this.isDragging = true;
      this.startY = e.clientY;
      this.startVal = this.currentValue;
      knobEl.setPointerCapture(e.pointerId);
      this.element.classList.add('knob-active');
      e.preventDefault();
    };

    knobEl.onpointermove = (e: PointerEvent) => {
      if (!this.isDragging) return;
      const deltaY = this.startY - e.clientY; // upward drag increases
      const range = this.options.max - this.options.min;

      // Holding Shift enables precision fine-tuning mode (4x resolution)
      const sensitivity = e.shiftKey ? 500 : 130;
      const deltaVal = (deltaY / sensitivity) * range;

      let newVal = this.clamp(this.startVal + deltaVal);
      newVal = this.snapToStep(newVal);

      if (newVal !== this.currentValue) {
        this.currentValue = newVal;
        this.updateVisuals();
        this.options.onChange(this.currentValue);
      }
    };

    const stopDrag = (e: PointerEvent) => {
      if (this.isDragging) {
        this.isDragging = false;
        try {
          knobEl.releasePointerCapture(e.pointerId);
        } catch (_) {}
        this.element.classList.remove('knob-active');
      }
    };

    knobEl.onpointerup = stopDrag;
    knobEl.onpointercancel = stopDrag;

    // Mouse wheel support
    knobEl.onwheel = (e: WheelEvent) => {
      e.preventDefault();
      const step = this.options.step || (this.options.max - this.options.min) / 100;
      const dir = e.deltaY < 0 ? 1 : -1;
      const mult = e.shiftKey ? 0.2 : 1;
      const newVal = this.clamp(this.snapToStep(this.currentValue + dir * step * mult));
      if (newVal !== this.currentValue) {
        this.currentValue = newVal;
        this.updateVisuals();
        this.options.onChange(this.currentValue);
      }
    };

    // Double click to reset to default value
    knobEl.ondblclick = (e: MouseEvent) => {
      e.preventDefault();
      const def = this.options.defaultValue !== undefined ? this.options.defaultValue : this.options.min;
      this.setValue(def, true);
    };
  }

  public setValue(val: number, notify = false): void {
    const clamped = this.snapToStep(this.clamp(val));
    if (clamped !== this.currentValue) {
      this.currentValue = clamped;
      this.updateVisuals();
      if (notify) {
        this.options.onChange(this.currentValue);
      }
    }
  }

  public getValue(): number {
    return this.currentValue;
  }
}
