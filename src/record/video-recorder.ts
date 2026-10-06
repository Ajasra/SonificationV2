// High-Performance Hardware-Accelerated Video & Audio Recorder
export class VideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording = false;
  private videoTrack: MediaStreamTrack | null = null;
  private chosenMime = '';

  startRecording(canvas: HTMLCanvasElement, audioStream?: MediaStream | null): void {
    this.recordedChunks = [];

    // Prioritize hardware-accelerated H.264/AVC1 codecs to eliminate CPU spikes
    const mimeTypes = [
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=h264',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/webm;codecs=vp9',
    ];
    this.chosenMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    // Use captureStream(0) for deterministic frame capture in lockstep with render loop
    let stream: MediaStream;
    try {
      stream = canvas.captureStream(0);
      this.videoTrack = stream.getVideoTracks()[0] || null;
      if (!this.videoTrack || !('requestFrame' in this.videoTrack)) {
        stream = canvas.captureStream(30);
        this.videoTrack = null;
      }
    } catch (_) {
      stream = canvas.captureStream(30);
      this.videoTrack = null;
    }

    // Attach synchronized audio track if provided
    if (audioStream) {
      const audioTracks = audioStream.getAudioTracks();
      if (audioTracks.length > 0) {
        stream.addTrack(audioTracks[0]);
      }
    }

    try {
      const options: MediaRecorderOptions = {
        videoBitsPerSecond: 4_000_000, // 4 Mbps target prevents CPU encoder rate-control thrashing
      };
      if (this.chosenMime) {
        options.mimeType = this.chosenMime;
      }

      this.mediaRecorder = new MediaRecorder(stream, options);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };

      // 1000ms timeslices avoid frequent event loop interrupts
      this.mediaRecorder.start(1000);
      this.isRecording = true;
    } catch (e) {
      console.error('Failed to start MediaRecorder', e);
    }
  }

  captureFrame(): void {
    if (this.isRecording && this.videoTrack && 'requestFrame' in this.videoTrack) {
      try {
        (this.videoTrack as CanvasCaptureMediaStreamTrack).requestFrame();
      } catch (_) {}
    }
  }

  stopRecording(): Promise<{ blob: Blob; mime: string; ext: string }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(new Error('Recorder not active'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mime = this.mediaRecorder?.mimeType || this.chosenMime || 'video/webm';
        const ext = mime.includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(this.recordedChunks, { type: mime });
        this.isRecording = false;
        this.videoTrack = null;
        resolve({ blob, mime, ext });
      };

      this.mediaRecorder.stop();
    });
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }
}
