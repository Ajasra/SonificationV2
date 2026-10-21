// Web Audio API Player for Sonopticon
// Reusable pre-allocated AudioBuffer to prevent GC stutter
export class SoundCameraAudio {
  private ctx: AudioContext | null = null;
  private monitorGainNode: GainNode | null = null;
  private recordGainNode: GainNode | null = null;
  private generatedGainNode: GainNode | null = null;
  private inputGainNode: GainNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private isMuted = true;
  private isRecording = false;
  private volume = 0.5;
  private inputVolume = 0.7;

  private mediaElementSource: MediaElementAudioSourceNode | null = null;
  private activeMediaElement: HTMLMediaElement | null = null;
  private mediaStreamSource: MediaStreamAudioSourceNode | null = null;
  private activeMediaStream: MediaStream | null = null;

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
      this.monitorGainNode = this.ctx.createGain();
      this.recordGainNode = this.ctx.createGain();
      this.generatedGainNode = this.ctx.createGain();
      this.inputGainNode = this.ctx.createGain();
      this.analyserNode = this.ctx.createAnalyser();
      this.analyserNode.fftSize = 256;

      this.playbackBuffer = this.ctx.createBuffer(1, SoundCameraAudio.PLAYBACK_SIZE, this.sampleRate);

      // Volume gains for generated sonification and source audio (video/mic)
      this.generatedGainNode.gain.value = this.volume;
      this.inputGainNode.gain.value = this.inputVolume;

      // Both generated and source audio route into monitorGainNode (for speaker output)
      this.generatedGainNode.connect(this.monitorGainNode);
      this.inputGainNode.connect(this.monitorGainNode);

      // Monitor gain goes to user's physical speakers through analyser (controlled by mute toggle)
      this.monitorGainNode.gain.value = this.isMuted ? 0 : 1.0;
      this.monitorGainNode.connect(this.analyserNode);
      this.analyserNode.connect(this.ctx.destination);

      // Both generated and source audio route into recordGainNode (for video recording)
      this.recordGainNode.gain.value = 1.0;
      this.generatedGainNode.connect(this.recordGainNode);
      this.inputGainNode.connect(this.recordGainNode);

      try {
        this.streamDest = this.ctx.createMediaStreamDestination();
        this.recordGainNode.connect(this.streamDest);
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
    if (this.monitorGainNode && this.ctx) {
      if (this.ctx.state === 'suspended' && !muted) {
        this.ctx.resume();
      }
      this.monitorGainNode.gain.setValueAtTime(muted ? 0 : 1.0, this.ctx.currentTime);
    }
  }

  getMuted(): boolean {
    return this.isMuted;
  }

  setIsRecording(recording: boolean): void {
    this.isRecording = recording;
    if (recording) {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
    }
  }

  setVolume(vol: number): void {
    this.volume = Math.max(0, Math.min(1, vol));
    if (this.generatedGainNode && this.ctx) {
      this.generatedGainNode.gain.setValueAtTime(this.volume, this.ctx.currentTime);
    }
  }

  getVolume(): number {
    return this.volume;
  }

  setInputVolume(vol: number): void {
    this.inputVolume = Math.max(0, Math.min(1, vol));
    if (this.inputGainNode && this.ctx) {
      this.inputGainNode.gain.setValueAtTime(this.inputVolume, this.ctx.currentTime);
    }
  }

  getInputVolume(): number {
    return this.inputVolume;
  }

  attachMediaElement(video: HTMLMediaElement): void {
    this.init();
    if (!this.ctx || typeof this.ctx.createMediaElementSource !== 'function') return;
    if (this.activeMediaElement === video) return;

    this.detachMediaElement();

    try {
      this.mediaElementSource = this.ctx.createMediaElementSource(video);
      if (this.inputGainNode) {
        this.mediaElementSource.connect(this.inputGainNode);
      }
      this.activeMediaElement = video;
      video.muted = false;
    } catch (err) {
      console.warn('Failed to route media element to Web Audio:', err);
    }
  }

  detachMediaElement(): void {
    if (this.mediaElementSource) {
      try {
        this.mediaElementSource.disconnect();
      } catch (_) {}
      this.mediaElementSource = null;
    }
    this.activeMediaElement = null;
  }

  attachMediaStream(stream: MediaStream): void {
    this.init();
    if (!this.ctx || typeof this.ctx.createMediaStreamSource !== 'function') return;
    if (this.activeMediaStream === stream) return;

    this.detachMediaStream();

    try {
      this.mediaStreamSource = this.ctx.createMediaStreamSource(stream);
      if (this.inputGainNode) {
        this.mediaStreamSource.connect(this.inputGainNode);
      }
      this.activeMediaStream = stream;
    } catch (err) {
      console.warn('Failed to route media stream to Web Audio:', err);
    }
  }

  detachMediaStream(): void {
    if (this.mediaStreamSource) {
      try {
        this.mediaStreamSource.disconnect();
      } catch (_) {}
      this.mediaStreamSource = null;
    }
    this.activeMediaStream = null;
  }

  playFrameSamples(samples: Float32Array): void {
    // Only synthesize audio if speaker monitor is unmuted OR active video recording is occurring
    if (!this.ctx || (!this.isRecording && this.isMuted) || samples.length === 0 || !this.playbackBuffer) return;

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
      if (this.generatedGainNode) {
        source.connect(this.generatedGainNode);
      } else {
        if (this.monitorGainNode) source.connect(this.monitorGainNode);
        if (this.recordGainNode) source.connect(this.recordGainNode);
      }

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

  dispose(): void {
    try {
      this.currentSource?.stop();
      this.currentSource?.disconnect();
    } catch (_) {}
    this.detachMediaElement();
    this.detachMediaStream();
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close().catch(() => {});
    }
    this.ctx = null;
    this.currentSource = null;
    this.playbackBuffer = null;
    this.generatedGainNode = null;
    this.inputGainNode = null;
    this.monitorGainNode = null;
    this.recordGainNode = null;
    this.analyserNode = null;
    this.streamDest = null;
    this.isRecording = false;
  }

  getContext(): AudioContext | null {
    this.init();
    return this.ctx;
  }

  async decodeAudioFile(file: File | Blob): Promise<AudioBuffer | null> {
    this.init();
    if (!this.ctx || typeof this.ctx.decodeAudioData !== 'function') return null;
    try {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume().catch(() => {});
      }
      const rawBuffer = await file.arrayBuffer();
      // Slice buffer copy to prevent detached ArrayBuffer errors
      const bufferCopy = rawBuffer.slice(0);
      return await this.ctx.decodeAudioData(bufferCopy);
    } catch (err) {
      console.warn('Could not decode audio track from video file:', err);
      return null;
    }
  }

  getAudioMediaStream(): MediaStream | null {
    this.init();
    return this.streamDest?.stream || null;
  }
}
