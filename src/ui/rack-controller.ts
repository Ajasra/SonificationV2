// Eurorack Modular DSP Rack Controller
import { FILTER_DESCRIPTORS } from '../engine/filters/factory.ts';
import { RotaryKnob } from '../components/rotary-knob.ts';
import type { FilterId, SonificationPreset } from '../types/index.ts';

export interface RackControllerOptions {
  getActivePreset: () => SonificationPreset;
  onRequestRender: () => void;
}

export class RackController {
  private container = document.getElementById('filter-rack-container') as HTMLDivElement;

  public static readonly CATEGORY_SHORT_NAMES: Record<string, string> = {
    dynamics: 'DYN',
    eq: 'EQ',
    delay: 'DLY',
    modulation: 'MOD',
    synth: 'SYN',
    distortion: 'DIST',
    lofi: 'LO-FI',
  };

  constructor(private opts: RackControllerOptions) {
    this.render();
  }

  public render(): void {
    if (!this.container) return;
    this.container.innerHTML = '';
    const activePreset = this.opts.getActivePreset();

    activePreset.filters.forEach((filterConfig, idx) => {
      const desc = FILTER_DESCRIPTORS[filterConfig.type];
      const card = document.createElement('div');
      card.className = 'rack-module';

      const header = document.createElement('div');
      header.className = 'module-header';

      const titleGroup = document.createElement('div');
      titleGroup.className = 'module-title-group';

      const catBadge = document.createElement('span');
      const catKey = desc ? desc.category : 'distortion';
      catBadge.className = `module-cat-pill cat-${catKey}`;
      catBadge.textContent = RackController.CATEGORY_SHORT_NAMES[catKey] || catKey.toUpperCase();
      catBadge.title = `Category: ${catKey.toUpperCase()}`;

      const title = document.createElement('span');
      title.className = 'module-title-text';
      title.textContent = `${String(idx + 1).padStart(2, '0')} / ${desc ? desc.name : filterConfig.type}`;

      titleGroup.appendChild(catBadge);
      titleGroup.appendChild(title);

      const headerBtns = document.createElement('div');
      headerBtns.className = 'module-actions';

      const toggleBtn = document.createElement('button');
      toggleBtn.className = `btn-module-toggle ${filterConfig.enabled ? 'is-active' : 'is-bypassed'}`;
      toggleBtn.textContent = filterConfig.enabled ? 'ON' : 'BYP';
      toggleBtn.title = 'Bypass or engage module';
      toggleBtn.onclick = () => {
        filterConfig.enabled = !filterConfig.enabled;
        this.render();
        this.opts.onRequestRender();
      };

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn-module-remove';
      removeBtn.textContent = '✕';
      removeBtn.title = 'Remove module from rack';
      removeBtn.onclick = () => {
        activePreset.filters.splice(idx, 1);
        this.render();
        this.opts.onRequestRender();
      };

      headerBtns.appendChild(toggleBtn);
      headerBtns.appendChild(removeBtn);
      header.appendChild(titleGroup);
      header.appendChild(headerBtns);
      card.appendChild(header);

      if (desc && desc.params.length > 0) {
        const paramsGrid = document.createElement('div');
        paramsGrid.className = 'module-params-grid';

        for (const p of desc.params) {
          const val = filterConfig.params[p.name] !== undefined ? filterConfig.params[p.name] : p.value;

          const knobTooltip = p.tooltip
            ? `${p.label}: ${p.tooltip} [Range: ${p.min} to ${p.max}]`
            : `${p.label} [Range: ${p.min} to ${p.max}]`;

          const knob = new RotaryKnob({
            min: p.min,
            max: p.max,
            step: p.step,
            value: val,
            defaultValue: p.value,
            label: p.label.split(' ')[0], // Compact label
            tooltip: knobTooltip,
            size: 34,
            onChange: (newVal) => {
              filterConfig.params[p.name] = newVal;
              this.opts.onRequestRender();
            },
          });

          paramsGrid.appendChild(knob.element);
        }

        card.appendChild(paramsGrid);
      }

      this.container.appendChild(card);
    });
  }

  public addFilter(type: FilterId): void {
    const desc = FILTER_DESCRIPTORS[type];
    if (!desc) return;
    const defaultParams: Record<string, number> = {};
    for (const p of desc.params) {
      defaultParams[p.name] = p.value;
    }

    const activePreset = this.opts.getActivePreset();
    activePreset.filters.push({
      id: 'f_' + Math.random().toString(36).substring(2, 7),
      type,
      enabled: true,
      sampleRate: 44100,
      params: defaultParams,
    });
    this.render();
    this.opts.onRequestRender();
  }
}
