import type { FilterId } from '../../types/index.ts';
import type { IDspFilter } from '../filters/base.ts';
import { SIN_TABLE } from '../filters/util.ts';

interface DspExports extends WebAssembly.Exports {
  memory: WebAssembly.Memory;
  _initialize: () => void;
  malloc: (bytes: number) => number;
  free: (pointer: number) => void;
  dsp_abi_version: () => number;
  dsp_sine_table: () => number;
  dsp_create: (kind: number, rate: number, seed: number) => number;
  dsp_destroy: (handle: number) => void;
  dsp_reset: (handle: number) => void;
  dsp_set_params: (handle: number, params: number) => void;
  dsp_process: (handle: number, samples: number, length: number) => void;
  dsp_process_chain: (handles: number, count: number, samples: number, length: number, chunk: number) => void;
  dsp_state: (handle: number) => number;
  dsp_history: (handle: number) => number;
  dsp_history_length: (handle: number) => number;
  dsp_rng: (handle: number) => number;
  dsp_position: (handle: number) => number;
  dsp_noise_count: (handle: number) => number;
}
const definitions = {
  tapesat: { kind: 1, defaults: { drive: 2.5, bias: .1, bump: .4, bumpHz: 80, tone: 8000 }, bounds: [[1, 10], [-.5, .5], [0, 1], [40, 200], [1000, 18000]] },
  tapewow: { kind: 2, defaults: { wow: .5, flutter: .3, drift: .3, mix: 1 }, bounds: [[0, 1], [0, 1], [0, 1], [0, 1]] },
  moogladder: { kind: 3, defaults: { cutoff: 1200, resonance: 2.2, drive: 1.5 }, bounds: [[20, 18000], [0, 4], [1, 5]] },
} as const;
type SupportedId = keyof typeof definitions;

/** Experimental, single-owner scalar backend. Its random source is fixture-only. */
export class WasmDspRuntime {
  buildInfo?: Record<string, unknown>;
  private nodes = new Set<WasmFilter>();
  private samplesPointer = 0;
  private capacity = 0;
  private handlesPointer = 0;
  private handlesCapacity = 0;
  private disposed = false;
  private constructor(readonly exports: DspExports) {
    exports._initialize();
    if (exports.dsp_abi_version() !== 1) throw new Error('Unsupported DSP WASM ABI');
    new Float32Array(exports.memory.buffer, exports.dsp_sine_table(), SIN_TABLE.length).set(SIN_TABLE);
  }
  static async fromBytes(bytes: BufferSource): Promise<WasmDspRuntime> {
    const fatal = () => { throw new Error('DSP WASM runtime aborted'); };
    const result = await WebAssembly.instantiate(bytes, { wasi_snapshot_preview1: { proc_exit: fatal, fd_close: fatal, fd_seek: fatal, fd_write: fatal } });
    return new WasmDspRuntime(result.instance.exports as DspExports);
  }
  static async load(url = '/wasm/dsp-scalar.wasm'): Promise<WasmDspRuntime> {
    const [response, metadataResponse] = await Promise.all([fetch(url), fetch(url.replace(/\.wasm$/, '.build.json'))]);
    if (!response.ok) throw new Error(`DSP WASM asset failed: ${response.status}`);
    if (!metadataResponse.ok) throw new Error('DSP WASM build metadata unavailable');
    const bytes = await response.arrayBuffer(), metadata = await metadataResponse.json();
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    if (metadata.abiVersion !== 1 || metadata.wasmSha256 !== hash) throw new Error('DSP WASM artifact/metadata mismatch');
    const runtime = await this.fromBytes(bytes); runtime.buildInfo = metadata; return runtime;
  }
  allocate(bytes: number): number {
    this.assertActive();
    const pointer = this.exports.malloc(bytes);
    if (!pointer) throw new Error('DSP WASM memory exhausted');
    return pointer;
  }
  assertActive(): void { if (this.disposed) throw new Error('DSP WASM runtime disposed'); }
  releaseFilter(filter: WasmFilter): void { this.nodes.delete(filter); }
  createFilter = (type: FilterId, rate = 44100, seed = 4821): WasmFilter => {
    this.assertActive();
    if (!(type in definitions)) throw new Error(`Unsupported scalar WASM filter: ${type}`);
    if (!Number.isInteger(seed) || seed <= 0 || seed > 0xffffffff) throw new Error('WASM fixture seed must be a nonzero u32');
    const filter = new WasmFilter(this, type as SupportedId, rate, seed);
    this.nodes.add(filter); return filter;
  };
  processSegment = (filters: IDspFilter[], samples: Float32Array): void => {
    this.assertActive();
    if (!filters.length) return;
    const nodes = filters.map(filter => {
      if (!(filter instanceof WasmFilter) || filter.owner !== this) throw new Error('Mixed WASM runtime segment');
      filter.assertAlive(); return filter;
    });
    if (samples.length > this.capacity) {
      const replacement = this.allocate(samples.length * 4);
      this.exports.free(this.samplesPointer); this.samplesPointer = replacement; this.capacity = samples.length;
    }
    if (nodes.length > this.handlesCapacity) {
      const replacement = this.allocate(nodes.length * 4);
      this.exports.free(this.handlesPointer); this.handlesPointer = replacement; this.handlesCapacity = nodes.length;
    }
    const memory = this.exports.memory.buffer;
    const view = new Float32Array(memory, this.samplesPointer, samples.length);
    view.set(samples);
    new Uint32Array(memory, this.handlesPointer, nodes.length).set(nodes.map(node => node.handle));
    this.exports.dsp_process_chain(this.handlesPointer, nodes.length, this.samplesPointer, samples.length, 8192);
    samples.set(view);
  };
  dispose(): void {
    if (this.disposed) return;
    for (const node of this.nodes) node.dispose();
    this.nodes.clear(); this.exports.free(this.samplesPointer); this.exports.free(this.handlesPointer);
    this.disposed = true;
  }
}

export class WasmFilter implements IDspFilter {
  readonly handle: number;
  private readonly paramsPointer: number;
  private params: Record<string, number>;
  private disposed = false;
  constructor(readonly owner: WasmDspRuntime, readonly type: SupportedId, readonly sampleRate: number, seed: number) {
    this.handle = owner.exports.dsp_create(definitions[type].kind, sampleRate, seed);
    if (!this.handle) throw new Error('Invalid sample rate or WASM allocation failure');
    try { this.paramsPointer = owner.allocate(40); }
    catch (error) { owner.exports.dsp_destroy(this.handle); throw error; }
    this.params = { ...definitions[type].defaults };
  }
  assertAlive(): void { this.owner.assertActive(); if (this.disposed) throw new Error('DSP filter disposed'); }
  init(): void { this.assertAlive(); this.owner.exports.dsp_reset(this.handle); }
  randomize(): void { throw new Error('Experimental WASM backend does not randomize presets'); }
  setParams(params: Record<string, number>): void {
    this.assertAlive();
    let changed = false;
    const next = { ...this.params };
    const keys = Object.keys(definitions[this.type].defaults);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i], value = params[key];
      if (value === undefined) continue;
      if (!Number.isFinite(value)) throw new Error('Non-finite DSP parameter');
      const [lo, hi] = definitions[this.type].bounds[i];
      const clamped = Math.max(lo, Math.min(hi, value));
      if (this.params[key] !== clamped) { changed = true; next[key] = clamped; }
    }
    if (changed) {
      this.params = next;
      new Float64Array(this.owner.exports.memory.buffer, this.paramsPointer, keys.length).set(keys.map(key => this.params[key]));
      this.owner.exports.dsp_set_params(this.handle, this.paramsPointer);
    }
  }
  getParams(): Record<string, number> { return { ...this.params }; }
  processBlock(samples: Float32Array): void { this.owner.processSegment([this], samples); }
  exportState() {
    this.assertAlive();
    const api = this.owner.exports, length = api.dsp_history_length(this.handle);
    return { version: 1, sampleRate: this.sampleRate,
      values: new Float64Array(api.memory.buffer, api.dsp_state(this.handle), 8).slice(),
      buffer: length ? new Float32Array(api.memory.buffer, api.dsp_history(this.handle), length).slice() : new Float32Array(),
      pos: api.dsp_position(this.handle), noiseCount: api.dsp_noise_count(this.handle), randomState: api.dsp_rng(this.handle) >>> 0 };
  }
  dispose(): void {
    if (this.disposed) return;
    this.owner.exports.dsp_destroy(this.handle); this.owner.exports.free(this.paramsPointer); this.disposed = true;
    this.owner.releaseFilter(this);
  }
}
