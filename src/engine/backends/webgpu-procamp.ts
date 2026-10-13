/// <reference types="@webgpu/types" />

const shader = `
struct Params { values: array<f32, 12> }
@group(0) @binding(0) var<storage, read_write> pixels: array<u32>;
@group(0) @binding(1) var<uniform> params: Params;
@compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let i = id.x;
  if (i >= arrayLength(&pixels)) { return; }
  let pixel = pixels[i];
  let r = f32(pixel & 255u);
  let g = f32((pixel >> 8u) & 255u);
  let b = f32((pixel >> 16u) & 255u);
  let a = (pixel >> 24u) & 255u;
  let y = 0.299 * r + 0.587 * g + 0.114 * b;
  let ny = clamp((y - 16.0) * params.values[0] + 16.0 + params.values[1], 0.0, params.values[2]);
  let rr = clamp(i32(ny + r * params.values[3] + g * params.values[4] + b * params.values[5] + 0.5), 0, 255);
  let gg = clamp(i32(ny + r * params.values[6] + g * params.values[7] + b * params.values[8] + 0.5), 0, 255);
  let bb = clamp(i32(ny + r * params.values[9] + g * params.values[10] + b * params.values[11] + 0.5), 0, 255);
  pixels[i] = u32(rr) | (u32(gg) << 8u) | (u32(bb) << 16u) | (a << 24u);
}`;

export interface ProcAmpParams {
  pedestal: number;
  videoGain: number;
  saturation: number;
  chromaPhase: number;
  whiteClip: number;
}

export class WebGpuProcAmp {
  private readonly pipeline: GPUComputePipeline;
  private readonly paramsBuffer: GPUBuffer;
  private readonly layout: GPUBindGroupLayout;
  private inputBuffer?: GPUBuffer;
  private readbackBuffer?: GPUBuffer;
  private capacity = 0;
  private disposed = false;

  private constructor(private readonly device: GPUDevice) {
    this.pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: device.createShaderModule({ code: shader }), entryPoint: 'main' },
    });
    this.layout = this.pipeline.getBindGroupLayout(0);
    this.paramsBuffer = device.createBuffer({ size: 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }

  static async create(): Promise<WebGpuProcAmp> {
    if (!navigator.gpu) throw new Error('WebGPU unavailable');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('WebGPU adapter unavailable');
    return new WebGpuProcAmp(await adapter.requestDevice());
  }

  async processFrame(rgba: Uint8ClampedArray, width: number, height: number, params: ProcAmpParams, audioPeak = 0): Promise<Uint8ClampedArray> {
    if (this.disposed) throw new Error('WebGPU ProcAmp disposed');
    const byteLength = width * height * 4;
    if (rgba.length !== byteLength) throw new Error('ProcAmp input dimensions do not match RGBA byte length');
    if (byteLength % 4 !== 0) throw new Error('ProcAmp buffer alignment invalid');
    if (byteLength > this.capacity) {
      this.inputBuffer?.destroy(); this.readbackBuffer?.destroy();
      this.capacity = Math.ceil(byteLength / 4) * 4;
      this.inputBuffer = this.device.createBuffer({ size: this.capacity, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC });
      this.readbackBuffer = this.device.createBuffer({ size: this.capacity, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST });
    }

    const ped = params.pedestal;
    const gain = params.videoGain + (audioPeak > .05 ? audioPeak * .4 : 0);
    const sat = params.saturation;
    const phase = params.chromaPhase * Math.PI / 180;
    const cos = Math.cos(phase) * sat, sin = Math.sin(phase) * sat;
    const ur = -.14713, ug = -.28886, ub = .436, vr = .615, vg = -.51499, vb = -.10001;
    const nur = ur * cos - vr * sin, nug = ug * cos - vg * sin, nub = ub * cos - vb * sin;
    const nvr = ur * sin + vr * cos, nvg = ug * sin + vr * cos, nvb = ub * sin + vr * cos;
    const values = new Float32Array([
      gain, ped, params.whiteClip,
      1.13983 * nvr, 1.13983 * nvg, 1.13983 * nvb,
      -.39465 * nur - .58060 * nvr, -.39465 * nug - .58060 * nvg, -.39465 * nub - .58060 * nvb,
      2.03211 * nur, 2.03211 * nug, 2.03211 * nub,
    ]);
    this.device.queue.writeBuffer(this.paramsBuffer, 0, values);
    this.device.queue.writeBuffer(this.inputBuffer!, 0, rgba.buffer, rgba.byteOffset, byteLength);
    const bindGroup = this.device.createBindGroup({ layout: this.layout, entries: [
      { binding: 0, resource: { buffer: this.inputBuffer! } },
      { binding: 1, resource: { buffer: this.paramsBuffer } },
    ] });
    const encoder = this.device.createCommandEncoder();
    const pass = encoder.beginComputePass();
    pass.setPipeline(this.pipeline); pass.setBindGroup(0, bindGroup); pass.dispatchWorkgroups(Math.ceil(width * height / 256)); pass.end();
    encoder.copyBufferToBuffer(this.inputBuffer!, 0, this.readbackBuffer!, 0, byteLength);
    this.device.queue.submit([encoder.finish()]);
    await this.readbackBuffer!.mapAsync(GPUMapMode.READ);
    const result = new Uint8ClampedArray(this.readbackBuffer!.getMappedRange().slice(0));
    this.readbackBuffer!.unmap();
    return result;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.inputBuffer?.destroy(); this.readbackBuffer?.destroy(); this.paramsBuffer.destroy(); this.device.destroy();
  }
}
