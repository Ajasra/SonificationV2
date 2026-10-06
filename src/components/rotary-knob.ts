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
  private dialCap!: HTMLElement;
  private arcPath!: SVGPathElement;
  private valueDisplay!: HTMLElement;

  private static readonly START_ANGLE = -135; // degrees (7 o'clock)
  private static readonly END_ANGLE = 135;   // degrees (5 o'clock)
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

    // Label on top (PCB silkscreen style)
    const labelEl = document.createElement('div');
    labelEl.className = 'knob-label';
    labelEl.textContent = this.options.label;
    labelEl.title = this.options.label;
    container.appendChild(labelEl);

    // Knob assembly wrapper
    const assembly = document.createElement('div');
    assembly.className = 'knob-assembly';
    const sz = this.options.size!;
    assembly.style.width = `${sz}px`;
    assembly.style.height = `${sz}px`;

    // SVG Dial track & tick marks
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'knob-svg');
    svg.setAttribute('viewBox', '0 0 100 100');

    // Background track arc
    const bgArc = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    bgArc.setAttribute('class', 'knob-track-bg');
    bgArc.setAttribute('d', this.describeArc(50, 50, 42, RotaryKnob.START_ANGLE, RotaryKnob.END_ANGLE));
    svg.appendChild(bgArc);

    // Active value arc
    this.arcPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    this.arcPath.setAttribute('class', 'knob-track-active');
    svg.appendChild(this.arcPath);

    // Graduation tick dots around periphery
    const tickCount = 9;
    for (let i = 0; i < tickCount; i++) {
      const tickNorm = i / (tickCount - 1);
      const tickAngle = (RotaryKnob.START_ANGLE + tickNorm * RotaryKnob.TOTAL_ANGLE - 90) * (Math.PI / 180);
      const r = 47;
      const tx = 50 + r * Math.cos(tickAngle);
      const ty = 50 + r * Math.sin(tickAngle);

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', tx.toFixed(1));
      dot.setAttribute('cy', ty.toFixed(1));
      dot.setAttribute('r', i === 0 || i === tickCount - 1 || i === Math.floor(tickCount / 2) ? '1.8' : '1.2');
      dot.setAttribute('class', 'knob-tick-dot');
      svg.appendChild(dot);
    }

    assembly.appendChild(svg);

    // Rotary dial cap
    this.dialCap = document.createElement('div');
    this.dialCap.className = 'knob-cap';
    this.dialCap.style.width = `${sz - 12}px`;
    this.dialCap.style.height = `${sz - 12}px`;

    // Pointer indicator line
    const pointer = document.createElement('div');
    pointer.className = 'knob-pointer';
    this.dialCap.appendChild(pointer);

    assembly.appendChild(this.dialCap);
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

  private polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  }

  private describeArc(x: number, y: number, radius: number, startAngle: number, endAngle: number): string {
    const start = this.polarToCartesian(x, y, radius, endAngle);
    const end = this.polarToCartesian(x, y, radius, startAngle);
    const arcSweep = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${arcSweep} 0 ${end.x} ${end.y}`;
  }

  private updateVisuals(): void {
    const angle = this.getAngle();
    this.dialCap.style.transform = `rotate(${angle}deg)`;

    // Update active arc SVG path
    if (this.currentValue <= this.options.min) {
      this.arcPath.setAttribute('d', '');
    } else {
      this.arcPath.setAttribute(
        'd',
        this.describeArc(50, 50, 42, RotaryKnob.START_ANGLE, angle)
      );
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
