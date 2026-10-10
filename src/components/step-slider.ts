// Reusable detented (stepped) fader for Sonification V2.
// Wraps a native <input type="range"> so keyboard, touch and a11y work for free;
// adds a copper-ticked rail, clickable detent labels and a live readout.

export interface StepSliderOption<T extends string> {
  value: T;
  label: string; // short detent label under the rail
  hint?: string; // descriptive text shown in the readout
}

export interface StepSliderConfig<T extends string> {
  options: StepSliderOption<T>[];
  value: T;
  ariaLabel: string;
  onChange: (value: T) => void;
}

export class StepSlider<T extends string> {
  public readonly element: HTMLElement;
  private readonly cfg: StepSliderConfig<T>;
  private readonly input: HTMLInputElement;
  private readonly readout: HTMLElement;
  private readonly hint: HTMLElement;
  private readonly ticks: HTMLElement[] = [];
  private readonly labels: HTMLButtonElement[] = [];

  constructor(cfg: StepSliderConfig<T>) {
    this.cfg = cfg;
    const last = cfg.options.length - 1;

    this.element = document.createElement('div');
    this.element.className = 'step-slider';
    this.element.style.setProperty('--steps', String(last));

    const head = document.createElement('div');
    head.className = 'step-slider-head';
    this.readout = document.createElement('span');
    this.readout.className = 'step-slider-readout';
    this.hint = document.createElement('span');
    this.hint.className = 'step-slider-hint';
    head.append(this.readout, this.hint);

    const track = document.createElement('div');
    track.className = 'step-slider-track';
    const rail = document.createElement('div');
    rail.className = 'step-slider-rail';
    track.append(rail);

    this.input = document.createElement('input');
    this.input.type = 'range';
    this.input.className = 'step-slider-input';
    this.input.min = '0';
    this.input.max = String(last);
    this.input.step = '1';
    this.input.setAttribute('aria-label', cfg.ariaLabel);

    const labels = document.createElement('div');
    labels.className = 'step-slider-labels';

    cfg.options.forEach((opt, i) => {
      const pos = `${last === 0 ? 0 : (i / last) * 100}`;
      const tick = document.createElement('span');
      tick.className = 'step-slider-tick';
      tick.style.setProperty('--pos', pos);
      this.ticks.push(tick);
      track.append(tick);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.tabIndex = -1;
      btn.className = 'step-slider-label';
      btn.style.setProperty('--pos', pos);
      btn.textContent = opt.label;
      btn.addEventListener('click', () => this.commit(i));
      this.labels.push(btn);
      labels.append(btn);
    });

    track.append(this.input);
    this.input.addEventListener('input', () => this.commit(Number(this.input.value)));
    this.element.append(head, track, labels);

    this.setValue(cfg.value);
  }

  public getValue(): T {
    return this.cfg.options[Number(this.input.value)].value;
  }

  /** Programmatic update; does not fire onChange. */
  public setValue(value: T): void {
    const idx = this.cfg.options.findIndex((o) => o.value === value);
    if (idx >= 0) this.render(idx);
  }

  private commit(idx: number): void {
    this.render(idx);
    this.cfg.onChange(this.cfg.options[idx].value);
  }

  private render(idx: number): void {
    const opt = this.cfg.options[idx];
    const last = this.cfg.options.length - 1;
    this.input.value = String(idx);
    this.input.setAttribute('aria-valuetext', opt.hint ? `${opt.label} ${opt.hint}` : opt.label);
    this.element.style.setProperty('--fill', String(last === 0 ? 0 : (idx / last) * 100));
    this.readout.textContent = opt.label;
    this.hint.textContent = opt.hint ?? '';
    this.ticks.forEach((t, i) => t.classList.toggle('is-passed', i <= idx));
    this.labels.forEach((l, i) => l.classList.toggle('is-active', i === idx));
  }
}
