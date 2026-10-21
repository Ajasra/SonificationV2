// Unified chain rack: audio DSP and analog video modules interleaved in one ordered rack.
import { FILTER_DESCRIPTORS } from '../engine/filters/factory.ts';
import { VIDEO_FILTER_DESCRIPTORS } from '../engine/video-filters/factory.ts';
import { resolveChain, commitChain } from '../engine/chain.ts';
import type { ChainEntry } from '../engine/chain.ts';
import { ModularRackController } from './rack-controller.ts';
import type {
  FilterId,
  FilterNodeConfig,
  SonopticonPreset,
  
  VideoFilterId,
  VideoFilterNodeConfig,
} from '../types/index.ts';

type AnyNodeConfig = FilterNodeConfig | VideoFilterNodeConfig;
type NodeKind = 'audio' | 'video';

export interface ChainRackControllerOptions {
  getActivePreset: () => SonopticonPreset;
  onRequestRender: () => void;
}

interface ChainRackState {
  /** Which domain each config object belongs to (refreshed on every getModules call). */
  kindOf: WeakMap<AnyNodeConfig, NodeKind>;
  /** Domain of the module being added through createDefaultModule. */
  pending: NodeKind;
}

export class ChainRackController extends ModularRackController<AnyNodeConfig, string> {
  public static readonly CATEGORY_SHORT_NAMES: Record<string, string> = {
    dynamics: 'DYN',
    eq: 'EQ',
    delay: 'DLY',
    modulation: 'MOD',
    synth: 'SYN',
    distortion: 'DIST',
    lofi: 'LO-FI',
    raster: 'RSTR',
    color: 'CLR',
    sync: 'SYNC',
    tape: 'TAPE',
    optic: 'OPT',
  };

  private state!: ChainRackState;

  constructor(opts: ChainRackControllerOptions) {
    const state: ChainRackState = { kindOf: new WeakMap(), pending: 'audio' };
    super({
      container: document.getElementById('filter-rack-container') as HTMLDivElement,
      emptyHint: '// NO MODULES ENGAGED • TAP [+] TO ADD',
      getModules: () =>
        resolveChain(opts.getActivePreset()).map((e) => {
          state.kindOf.set(e.cfg, e.kind);
          return e.cfg;
        }),
      setModules: (modules) => {
        const entries: ChainEntry[] = modules.map((cfg) =>
          state.kindOf.get(cfg) === 'video'
            ? { kind: 'video', cfg: cfg as VideoFilterNodeConfig }
            : { kind: 'audio', cfg: cfg as FilterNodeConfig }
        );
        commitChain(opts.getActivePreset(), entries);
      },
      getKind: (cfg) => state.kindOf.get(cfg) ?? 'audio',
      getDescriptor: (type, cfg) =>
        cfg && state.kindOf.get(cfg) === 'video'
          ? VIDEO_FILTER_DESCRIPTORS[type as VideoFilterId]
          : FILTER_DESCRIPTORS[type as FilterId],
      categoryShortNames: ChainRackController.CATEGORY_SHORT_NAMES,
      createDefaultModule: (type) => {
        const isVideo = state.pending === 'video';
        const desc = isVideo
          ? VIDEO_FILTER_DESCRIPTORS[type as VideoFilterId]
          : FILTER_DESCRIPTORS[type as FilterId];
        const params: Record<string, number> = {};
        if (desc) for (const p of desc.params) params[p.name] = p.value;
        const id = (isVideo ? 'vf_' : 'f_') + Math.random().toString(36).substring(2, 7);
        const cfg: AnyNodeConfig = isVideo
          ? { id, type: type as VideoFilterId, enabled: true, params }
          : { id, type: type as FilterId, enabled: true, sampleRate: 44100, params };
        state.kindOf.set(cfg, state.pending);
        return cfg;
      },
      onRequestRender: opts.onRequestRender,
    });
    this.state = state;
  }

  public addAudioFilter(type: FilterId): void {
    this.state.pending = 'audio';
    this.addFilter(type);
  }

  public addVideoFilter(type: VideoFilterId): void {
    this.state.pending = 'video';
    this.addFilter(type);
  }
}
