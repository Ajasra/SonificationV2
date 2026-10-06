// Web Audio API Player for Sonification V2
// Bridges visual databend samples to sound output through device speakers

export class SoundCameraAudio {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isMuted = true;
  private volume = 0.5;

  private currentSource: AudioBufferSourceNode | null = null;

  init(): void {
    if (!this.ctx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.gainNode = this.ctx.createGain();
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 256;

      this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.ctx.destination);
    }
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.gainNode && this.ctx) {
      if (this.ctx.state === 'suspended' && !muted) {
        this.ctx.resume();
      }
      this.gainNode.gain.setValueAtTime(muted ? 0 : this.volume, this.ctx.currentTime);
    }
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.gainNode && this.ctx && !this.isMuted) {
      this.gainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  // Play a block of audio samples derived from the image/video frame
  playFrameSamples(samples: Float32Array, sampleRate: number = 44100): void {
    if (!this.ctx || this.isMuted || samples.length === 0) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    try {
      // Create an audio buffer for this frame
      const audioBuffer = this.ctx.createBuffer(1, samples.length, sampleRate);
      audioBuffer.getChannelData(0).set(samples);

      const source = this.ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode!);

      // Smoothly stop prior source to avoid clicks
      if (this.currentSource) {
        try {
          this.currentSource.stop();
        } catch (_) {}
      }

      source.start();
      this.currentSource = source;
    } catch (e) {
      console.warn('Audio playback glitch', e);
    }
  }

  getAnalyser(): AnalyserNode | null {
    return this.analyserNode;
  }
}
