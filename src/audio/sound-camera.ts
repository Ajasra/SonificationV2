// Web Audio API Player for Sonification V2
// Reusable pre-allocated AudioBuffer to prevent GC stutter
export class SoundCameraAudio {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isMuted = true;
  private volume = 0.5;

  private currentSource: AudioBufferSourceNode | null = null;
  private playbackBuffer: AudioBuffer | null = null;
  private streamDest: MediaStreamAudioDestinationNode | null = null;
  private static readonly PLAYBACK_SIZE = 4096;

  init(): void {
    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtxClass();
      this.gainNode = this.ctx.createGain();
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 256;

      this.playbackBuffer = this.ctx.createBuffer(1, SoundCameraAudio.PLAYBACK_SIZE, this.sampleRate);

      this.gainNode.gain.value = this.isMuted ? 0 : this.volume;
      this.gainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.ctx.destination);

      try {
        this.streamDest = this.ctx.createMediaStreamDestination();
        this.gainNode.connect(this.streamDest);
      } catch (_) {}
    }
  }

  private sampleRate = 44100;

  setSampleRate(rate: number): void {
    this.sampleRate = rate;
    if (this.ctx) {
      this.playbackBuffer = this.ctx.createBuffer(1, SoundCameraAudio.PLAYBACK_SIZE, rate);
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

  playFrameSamples(samples: Float32Array): void {
    if (!this.ctx || this.isMuted || samples.length === 0 || !this.playbackBuffer) return;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    try {
      const channel = this.playbackBuffer.getChannelData(0);
      const targetLen = SoundCameraAudio.PLAYBACK_SIZE;
      const stride = Math.max(1, Math.floor(samples.length / targetLen));

      for (let i = 0; i < targetLen; i++) {
        channel[i] = samples[i * stride] || 0;
      }

      const source = this.ctx.createBufferSource();
      source.buffer = this.playbackBuffer;
      source.connect(this.gainNode!);

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

  getAudioMediaStream(): MediaStream | null {
    return this.streamDest?.stream || null;
  }
}
