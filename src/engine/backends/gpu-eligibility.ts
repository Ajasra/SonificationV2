import type {SonificationPreset,FilterNodeConfig} from '../../types/index.ts';
import {resolveChain} from '../chain.ts';

export function eligibleTapeSat(preset:SonificationPreset,width:number,height:number):FilterNodeConfig | undefined {
  if(width!==1280 || height!==720 || preset.equalize || preset.blendMode!=='NONE')return;
  for(const config of [preset.reader,preset.writer])if(config.bits!==8 || config.sign!=='UNSIGNED' || config.rawType!=='INTERLEAVED' || config.law!=='NONE' || config.colorSpace!=='RGB')return;
  const active=resolveChain(preset).filter(entry=>entry.cfg.enabled);
  if(active.length!==1 || active[0].kind!=='audio' || active[0].cfg.type!=='tapesat' || active[0].cfg.sampleRate!==44100)return;
  return active[0].cfg;
}
