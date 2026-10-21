// High-Performance Hardware-Accelerated Video & Audio Recorder
export class VideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording = false;
  private chosenMime = '';
  private compositeCanvas: HTMLCanvasElement | null = null;
  private compositeFrame = 0;

  startRecording(canvas: HTMLCanvasElement, audioStream?: MediaStream | null, overlayCanvas?: HTMLCanvasElement): void {
    this.recordedChunks = [];

    let captureCanvas = canvas;
    if (overlayCanvas) {
      const composite = document.createElement('canvas');
      composite.width = canvas.width;
      composite.height = canvas.height;
      const compositeCtx = composite.getContext('2d');
      if (compositeCtx) {
        this.compositeCanvas = composite;
        const drawComposite = () => {
          if (!this.compositeCanvas) return;
          if (composite.width !== canvas.width || composite.height !== canvas.height) {
            composite.width = canvas.width;
            composite.height = canvas.height;
          }
          compositeCtx.clearRect(0, 0, composite.width, composite.height);
          compositeCtx.drawImage(canvas, 0, 0, composite.width, composite.height);
          compositeCtx.drawImage(overlayCanvas, 0, 0, composite.width, composite.height);
          this.compositeFrame = requestAnimationFrame(drawComposite);
        };
        drawComposite();
        captureCanvas = composite;
      }
    }

    // Ensure even width and height for H.264/VP8/VP9 hardware encoders (especially on mobile)
    if (canvas.width % 2 !== 0) canvas.width = Math.max(2, canvas.width & ~1);
    if (canvas.height % 2 !== 0) canvas.height = Math.max(2, canvas.height & ~1);

    // Detect Safari / iOS vs Chromium / Android / Firefox
    const isIOSorSafari =
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (/^((?!chrome|android).)*safari/i.test(navigator.userAgent));

    // Codec negotiation:
    // Prioritize MP4 (H.264/AVC + AAC) across all platforms (iOS, Android, desktop)
    // for direct compatibility with social platforms (Instagram, WeChat, TikTok) without transcoding.
    // Falls back gracefully to WebM (VP8/VP9/H.264 + Opus) if the browser's MediaRecorder lacks MP4 support.
    const preferredMimes = [
      'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
      'video/mp4;codecs=avc1,mp4a.40.2',
      'video/mp4;codecs=avc1.4d401f,mp4a.40.2',
      'video/mp4;codecs=avc1',
      'video/mp4',
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm',
    ];

    // Capture canvas stream at steady 30 FPS.
    // DO NOT use captureStream(0) on mobile: captureStream(0) lacks monotonic presentation timestamps,
    // which causes mobile hardware video encoders (Android MediaCodec & iOS AVFoundation) to drop
    // the video track while continuing to record audio, resulting in audio-only recordings.
    let canvasStream: MediaStream;
    try {
      canvasStream = captureCanvas.captureStream(30);
    } catch (_) {
      try {
        canvasStream = (canvas as any).mozCaptureStream ? (canvas as any).mozCaptureStream(30) : canvas.captureStream();
      } catch (err) {
        console.error('Failed to capture canvas stream', err);
        return;
      }
    }

    // Combine tracks into a brand-new MediaStream.
    // DO NOT call canvasStream.addTrack(audioTrack) directly:
    // On iOS Safari / WebKit, mutating CanvasCaptureMediaStream via addTrack() causes MediaRecorder
    // to discard the video track and only record audio. Creating a new MediaStream([videoTrack, audioTrack])
    // is fully compliant and supported across iOS Safari, Android Chrome, and desktop.
    const tracks: MediaStreamTrack[] = [];
    const videoTracks = canvasStream.getVideoTracks();
    if (videoTracks.length > 0) {
      tracks.push(videoTracks[0]);
    }

    if (audioStream) {
      const audioTracks = audioStream.getAudioTracks();
      if (audioTracks.length > 0) {
        tracks.push(audioTracks[0]);
      }
    }

    const combinedStream = new MediaStream(tracks);

    // Initialize MediaRecorder with fallback loop across supported codecs
    let recorder: MediaRecorder | null = null;
    for (const mime of preferredMimes) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(mime)) {
        try {
          const opts: MediaRecorderOptions = { mimeType: mime };
          if (!isIOSorSafari) {
            opts.videoBitsPerSecond = 3_000_000;
          }
          recorder = new MediaRecorder(combinedStream, opts);
          this.chosenMime = mime;
          break;
        } catch (e) {
          console.warn(`Failed initializing MediaRecorder with ${mime}:`, e);
        }
      }
    }

    if (!recorder) {
      try {
        recorder = new MediaRecorder(combinedStream);
        this.chosenMime = recorder.mimeType || '';
      } catch (e) {
        console.error('Fatal: MediaRecorder could not be initialized:', e);
        return;
      }
    }

    this.mediaRecorder = recorder;
    this.mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        this.recordedChunks.push(e.data);
      }
    };

    this.mediaRecorder.onerror = (e) => {
      console.error('MediaRecorder error event:', e);
    };

    try {
      this.mediaRecorder.start(1000);
      this.isRecording = true;
    } catch (e) {
      console.warn('MediaRecorder.start(1000) failed, attempting start() without timeslice:', e);
      try {
        this.mediaRecorder.start();
        this.isRecording = true;
      } catch (fatalStartErr) {
        console.error('Fatal: Failed to start MediaRecorder:', fatalStartErr);
      }
    }
  }

  captureFrame(): void {
    // CanvasCaptureMediaStream continuously captures at 30 fps via browser compositor.
  }

  stopRecording(): Promise<{ blob: Blob; mime: string; ext: string }> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(new Error('Recorder not active'));
        return;
      }

      const finish = () => {
        const mime = this.mediaRecorder?.mimeType || this.chosenMime || (this.isIOSorSafari() ? 'video/mp4' : 'video/webm');
        const ext = mime.toLowerCase().includes('mp4') ? 'mp4' : 'webm';
        const blob = new Blob(this.recordedChunks, { type: mime });
        this.isRecording = false;
        if (this.compositeFrame) cancelAnimationFrame(this.compositeFrame);
        this.compositeFrame = 0;
        this.compositeCanvas = null;
        resolve({ blob, mime, ext });
      };

      if (this.mediaRecorder.state === 'inactive') {
        finish();
        return;
      }

      this.mediaRecorder.onstop = finish;

      try {
        this.mediaRecorder.stop();
      } catch (err) {
        this.isRecording = false;
        reject(err);
      }
    });
  }

  private isIOSorSafari(): boolean {
    return (
      /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (/^((?!chrome|android).)*safari/i.test(navigator.userAgent))
    );
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }
}
