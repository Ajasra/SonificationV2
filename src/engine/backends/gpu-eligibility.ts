import type {SonopticonPreset,FilterNodeConfig,VideoFilterNodeConfig} from '../../types/index.ts';
import {resolveChain} from '../chain.ts';

/** Implementations the app can route to a GPU executor; this is inventory, not auto-route approval. */
export const GPU_FILTER_CAPABILITIES = Object.freeze({
  tapesat: { media: 'audio', executor: 'app-tapesat', segment: 'shared-webgpu-rack' },
  procamp: { media: 'video', executor: 'webgpu-video-tail', segment: 'shared-webgpu-rack' },
  solarizer: { media: 'video', executor: 'webgpu-video-tail', segment: 'shared-webgpu-rack' },
  colorizer: { media: 'video', executor: 'webgpu-video-tail', segment: 'shared-webgpu-rack' },
  cvislicer: { media: 'video', executor: 'webgpu-video-tail', segment: 'shared-webgpu-rack' },
  differentiator: { media: 'video', executor: 'webgpu-video-tail', segment: 'shared-webgpu-rack' },
} as const);

export type GpuFilterType = keyof typeof GPU_FILTER_CAPABILITIES;

export function getGpuFilterCapability(type:string) {
  return Object.hasOwn(GPU_FILTER_CAPABILITIES,type)
    ? GPU_FILTER_CAPABILITIES[type as GpuFilterType]
    : undefined;
}

export function hasGpuFilterImplementation(type:string):type is GpuFilterType {
  return getGpuFilterCapability(type)!==undefined;
}

export function hasGpuVideoImplementation(type:string):boolean {
  return getGpuFilterCapability(type)?.media==='video';
}

export type ApplicationRouteId='auto'|'cpu-reference'|'gpu-tapesat'|'cpu-gpu-video-tail'|'gpu-resident-rack'|'wasm-cpu';
export interface ApplicationRoutePlan {
  requestedRouteId:ApplicationRouteId;
  selectedRouteId:Exclude<ApplicationRouteId,'auto'>;
  activeNodeIds:string[];
  cpuPrefixNodeIds:string[];
  videoSuffixNodeIds:string[];
  fallbackReason?:string;
}

export function planApplicationRoute(input:{requested:ApplicationRouteId;preset:SonopticonPreset;width:number;height:number;webGpuAvailable:boolean;videoTailAvailable?:boolean;fileVideo:boolean;cameraActive:boolean}):ApplicationRoutePlan {
  const active=resolveChain(input.preset).filter(entry=>entry.cfg.enabled);
  const activeNodeIds=active.map(entry=>entry.cfg.id);
  const videoSuffix:{kind:'video';cfg:typeof active[number]['cfg']}[]=[];
  for(let i=active.length-1;i>=0;i--){
    const entry=active[i];
    if(entry.kind!=='video'||!hasGpuVideoImplementation(entry.cfg.type))break;
    videoSuffix.unshift(entry as {kind:'video';cfg:typeof active[number]['cfg']});
  }
  const suffixIds=videoSuffix.map(entry=>entry.cfg.id);
  const tailSuffixIds=videoSuffix[0]?.cfg.type==='procamp'?suffixIds.slice(1):suffixIds;
  const streamOk=[input.preset.reader,input.preset.writer].every(s=>s.bits===8&&s.sign==='UNSIGNED'&&s.rawType==='INTERLEAVED'&&s.law==='NONE'&&s.colorSpace==='RGB');
  const videoTailCompatible=input.videoTailAvailable&&input.webGpuAvailable&&input.width===1280&&input.height===720&&streamOk&&!input.preset.equalize&&input.preset.blendMode==='NONE'&&input.fileVideo&&!input.cameraActive;
  const resident=videoTailCompatible&&!!eligibleResidentVideoRack(input.preset,input.width,input.height);
  const automaticRoute=input.webGpuAvailable
    ? resident?'gpu-resident-rack'
      : videoTailCompatible&&tailSuffixIds.length>0?'cpu-gpu-video-tail'
        : eligibleTapeSat(input.preset,input.width,input.height)&&(input.fileVideo||input.cameraActive)?'gpu-tapesat':'cpu-reference'
    : 'cpu-reference';
  const requested=input.requested==='auto'?automaticRoute:input.requested;
  // Procamp's audio-reactive f32 gain can land on CPU/GPU byte-rounding edges.
  // Keep it in the CPU prefix and use the following supported GPU suffix.
  const selectedSuffixIds=requested==='cpu-gpu-video-tail'?tailSuffixIds:suffixIds;
  let prefixIds=activeNodeIds.slice(0,activeNodeIds.length-selectedSuffixIds.length);
  let selectedRouteId:Exclude<ApplicationRouteId,'auto'>='cpu-reference';
  let fallbackReason:string|undefined;
  if(requested==='cpu-reference')selectedRouteId='cpu-reference';
  else if(requested==='gpu-tapesat'){
    if(input.webGpuAvailable&&eligibleTapeSat(input.preset,input.width,input.height)&&(input.fileVideo||input.cameraActive))selectedRouteId='gpu-tapesat';
    else fallbackReason='TapeSat GPU route requires WebGPU, the validated exact TapeSat rack/format, and a loaded file source.';
  }else if(requested==='cpu-gpu-video-tail'){
    if(videoTailCompatible&&selectedSuffixIds.length>0)selectedRouteId='cpu-gpu-video-tail';
    else fallbackReason='GPU video-tail route requires its executor, 720p RGB 8-bit format, supported final video nodes, and a loaded file source.';
  }
  else if(requested==='gpu-resident-rack'){
    const residentRack=eligibleResidentVideoRack(input.preset,input.width,input.height);
    if(input.webGpuAvailable&&input.videoTailAvailable&&input.fileVideo&&!input.cameraActive&&residentRack){selectedRouteId='gpu-resident-rack';prefixIds=[];}
    else fallbackReason='Resident route requires the frozen 44.1 kHz TapeSat -> Procamp -> Solarizer -> Colorizer rack, 720p RGB 8-bit input, shared WebGPU devices, and a loaded file source.';
  }
  else if(requested==='wasm-cpu')fallbackReason='WASM route is not enabled by the application route coordinator.';
  return {requestedRouteId:input.requested,selectedRouteId,activeNodeIds,cpuPrefixNodeIds:prefixIds,videoSuffixNodeIds:selectedSuffixIds,...(fallbackReason?{fallbackReason}:{})};
}

export function shouldEnableTapeSatGpu(requestedBackend:string|null,webGpuAvailable:boolean):boolean {
  if(requestedBackend==='js' || requestedBackend==='wasm')return false;
  if(requestedBackend==='tapesat')return webGpuAvailable;
  return (requestedBackend===null || requestedBackend==='auto') && webGpuAvailable;
}

export function shouldUseTapeSatGpu(requestedBackend:string|null,webGpuAvailable:boolean,loadedFileVideo:boolean,cameraActive:boolean):boolean {
  if(requestedBackend==='tapesat')return webGpuAvailable;
  return (requestedBackend===null || requestedBackend==='auto') && webGpuAvailable && loadedFileVideo && !cameraActive;
}

export function isAccelerationBenchmark(requestedBackend:string|null):boolean {
  return requestedBackend==='js' || requestedBackend==='wasm' || requestedBackend==='tapesat' || requestedBackend==='auto' || requestedBackend==='cpu-reference' || requestedBackend==='cpu-gpu-video-tail' || requestedBackend==='gpu-resident-rack';
}

export function eligibleTapeSat(preset:SonopticonPreset,width:number,height:number):FilterNodeConfig | undefined {
  if(width!==1280 || height!==720 || preset.equalize || preset.blendMode!=='NONE')return;
  for(const config of [preset.reader,preset.writer])if(config.bits!==8 || config.sign!=='UNSIGNED' || config.rawType!=='INTERLEAVED' || config.law!=='NONE' || config.colorSpace!=='RGB')return;
  const active=resolveChain(preset).filter(entry=>entry.cfg.enabled);
  if(active.length!==1 || active[0].kind!=='audio' || active[0].cfg.type!=='tapesat' || active[0].cfg.sampleRate!==44100)return;
  return active[0].cfg;
}

export function eligibleResidentVideoRack(preset:SonopticonPreset,width:number,height:number):{audio:FilterNodeConfig;video:VideoFilterNodeConfig[]}|undefined {
  if(width!==1280||height!==720||preset.equalize||preset.blendMode!=='NONE')return;
  for(const config of [preset.reader,preset.writer])if(config.bits!==8||config.sign!=='UNSIGNED'||config.rawType!=='INTERLEAVED'||config.law!=='NONE'||config.colorSpace!=='RGB')return;
  const active=resolveChain(preset).filter(entry=>entry.cfg.enabled);
  if(active.length!==4||active[0].kind!=='audio'||active[0].cfg.type!=='tapesat'||active[0].cfg.sampleRate!==44100)return;
  const expected=['procamp','solarizer','colorizer'];
  const video=active.slice(1);
  if(video.some((entry,index)=>entry.kind!=='video'||entry.cfg.type!==expected[index]))return;
  return {audio:active[0].cfg,video:video.map(entry=>entry.cfg as VideoFilterNodeConfig)};
}
