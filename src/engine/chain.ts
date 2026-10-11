// Unified processing chain: one ordered list that interleaves audio DSP and video nodes.
// Storage stays in `preset.filters` / `preset.videoFilters`; `preset.chain` only holds the order.
import type { FilterNodeConfig, SonificationPreset, VideoFilterNodeConfig } from '../types/index.ts';

export type ChainEntry =
  | { kind: 'audio'; cfg: FilterNodeConfig }
  | { kind: 'video'; cfg: VideoFilterNodeConfig };

/**
 * Resolve the effective ordered node list. Dangling refs are skipped and nodes missing
 * from `chain` are appended (audio first, then video), so legacy presets keep the
 * historical order: audio DSP, then video rack.
 */
export function resolveChain(preset: SonificationPreset): ChainEntry[] {
  const audio = preset.filters || [];
  const video = preset.videoFilters || [];
  const out: ChainEntry[] = [];
  const usedA = new Set<FilterNodeConfig>();
  const usedV = new Set<VideoFilterNodeConfig>();

  if (preset.chain) {
    for (const ref of preset.chain) {
      if (ref.kind === 'audio') {
        const cfg = audio.find((f) => f.id === ref.id);
        if (cfg && !usedA.has(cfg)) { usedA.add(cfg); out.push({ kind: 'audio', cfg }); }
      } else {
        const cfg = video.find((f) => f.id === ref.id);
        if (cfg && !usedV.has(cfg)) { usedV.add(cfg); out.push({ kind: 'video', cfg }); }
      }
    }
  }
  for (const cfg of audio) if (!usedA.has(cfg)) out.push({ kind: 'audio', cfg });
  for (const cfg of video) if (!usedV.has(cfg)) out.push({ kind: 'video', cfg });
  return out;
}

/** Write an ordered node list back into the preset (filters, videoFilters and chain). */
export function commitChain(preset: SonificationPreset, entries: ChainEntry[]): void {
  const audio: FilterNodeConfig[] = [];
  const video: VideoFilterNodeConfig[] = [];
  for (const e of entries) {
    if (e.kind === 'audio') audio.push(e.cfg);
    else video.push(e.cfg);
  }
  preset.filters = audio;
  preset.videoFilters = video;
  preset.chain = entries.map((e) => ({ kind: e.kind, id: e.cfg.id }));
}
