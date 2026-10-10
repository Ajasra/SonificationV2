// Analog Video Processing Rack Controller
// Uses the unified ModularRackController component
import { VIDEO_FILTER_DESCRIPTORS } from '../engine/video-filters/factory.ts';
import { ModularRackController } from './rack-controller.ts';
import type { VideoFilterId, VideoFilterNodeConfig, SonificationPreset } from '../types/index.ts';

export interface VideoRackControllerOptions {
  getActivePreset: () => SonificationPreset;
  onRequestRender: () => void;
}

export class VideoRackController extends ModularRackController<VideoFilterNodeConfig, VideoFilterId> {
  public static readonly CATEGORY_SHORT_NAMES: Record<string, string> = {
    raster: 'RSTR',
    color: 'CLR',
    sync: 'SYNC',
    tape: 'TAPE',
    optic: 'OPT',
  };

  constructor(opts: VideoRackControllerOptions) {
    super({
      container: document.getElementById('video-rack-container') as HTMLDivElement,
      emptyHint: '// NO VIDEO MODULES ENGAGED • TAP [+] TO ADD',
      getModules: () => {
        const p = opts.getActivePreset();
        if (!p.videoFilters) {
          p.videoFilters = [];
        }
        return p.videoFilters;
      },
      setModules: (m) => {
        opts.getActivePreset().videoFilters = m;
      },
      getDescriptor: (type) => VIDEO_FILTER_DESCRIPTORS[type],
      categoryShortNames: VideoRackController.CATEGORY_SHORT_NAMES,
      createDefaultModule: (type) => {
        const desc = VIDEO_FILTER_DESCRIPTORS[type];
        const defaultParams: Record<string, number> = {};
        if (desc) {
          for (const p of desc.params) defaultParams[p.name] = p.value;
        }
        return {
          id: 'vf_' + Math.random().toString(36).substring(2, 7),
          type,
          enabled: true,
          params: defaultParams,
        };
      },
      onRequestRender: opts.onRequestRender,
    });
  }
}
