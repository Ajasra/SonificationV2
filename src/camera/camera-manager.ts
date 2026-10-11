// Camera Manager: Webcam (Desktop) and Rear/Front Camera (Mobile)
export class CameraManager {
  private videoElement: HTMLVideoElement;
  private currentStream: MediaStream | null = null;
  private facingMode: 'user' | 'environment' = 'environment';
  private preferredWidth = 1920;
  private preferredHeight = 1080;
  private isRunning = false;
  private generation = 0;
  private pendingStart: Promise<void> | null = null;

  constructor() {
    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.playsInline = true;
    this.videoElement.setAttribute('playsinline', 'true');
    this.videoElement.setAttribute('webkit-playsinline', 'true');
    this.videoElement.muted = true;
  }

  getVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  getFacingMode(): 'user' | 'environment' {
    return this.facingMode;
  }

  async toggleFacingMode(): Promise<void> {
    if (this.pendingStart) return;
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    if (this.isRunning) {
      await this.start(this.preferredWidth, this.preferredHeight);
    }
  }

  start(preferredWidth = 1920, preferredHeight = 1080): Promise<void> {
    this.preferredWidth = preferredWidth;
    this.preferredHeight = preferredHeight;
    if (this.pendingStart) return this.pendingStart;
    const operation = this.openCamera(preferredWidth, preferredHeight);
    this.pendingStart = operation;
    void operation.finally(() => {
      if (this.pendingStart === operation) this.pendingStart = null;
    }).catch(() => {});
    return operation;
  }

  private async openCamera(preferredWidth: number, preferredHeight: number): Promise<void> {
    this.stop();
    const generation = this.generation;
    const assertCurrent = () => {
      if (generation !== this.generation) throw new DOMException('Camera request cancelled', 'AbortError');
    };
    const acquire = async (constraints: MediaStreamConstraints): Promise<MediaStream> => {
      assertCurrent();
      let expired = false;
      let timer: ReturnType<typeof setTimeout>;
      const request = navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        if (expired || generation !== this.generation) {
          stream.getTracks().forEach(track => track.stop());
          throw new DOMException('Camera request cancelled', 'AbortError');
        }
        return stream;
      });
      try {
        return await Promise.race([request, new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            expired = true;
            reject(new DOMException('Camera did not respond. Tap START CAM to retry.', 'TimeoutError'));
          }, 12000);
        })]);
      } finally {
        clearTimeout(timer!);
      }
    };

    // Check if navigator.mediaDevices is supported or blocked due to HTTP
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isHttp = window.location.protocol === 'http:';
      const msg = isHttp
        ? 'Camera access is blocked by mobile browsers over plain HTTP.\nPlease open the HTTPS link: https://' + window.location.host + window.location.pathname
        : 'Camera access (navigator.mediaDevices) is not supported by this browser.';
      throw new Error(msg);
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: preferredWidth },
          height: { ideal: preferredHeight },
        },
      };

      let stream: MediaStream;
      try {
        stream = await acquire(constraints);
      } catch (firstErr) {
        if (!['OverconstrainedError', 'NotFoundError'].includes((firstErr as Error).name)) throw firstErr;
        console.warn('Preferred constraints failed, trying basic facingMode constraint:', firstErr);
        try {
          stream = await acquire({
            audio: false,
            video: { facingMode: this.facingMode },
          });
        } catch (secondErr) {
          if (!['OverconstrainedError', 'NotFoundError'].includes((secondErr as Error).name)) throw secondErr;
          console.warn('FacingMode failed, trying generic video constraint:', secondErr);
          stream = await acquire({
            audio: false,
            video: true,
          });
        }
      }

      this.currentStream = stream;
      this.videoElement.srcObject = stream;
      let playbackTimer: ReturnType<typeof setTimeout>;
      try {
        await Promise.race([this.videoElement.play(), new Promise<never>((_, reject) => {
          playbackTimer = setTimeout(() => reject(new DOMException('Camera playback stalled. Tap START CAM to retry.', 'TimeoutError')), 12000);
        })]);
      } finally {
        clearTimeout(playbackTimer!);
      }
      assertCurrent();
      this.isRunning = true;
    } catch (e) {
      if (generation === this.generation) this.stop();
      console.error('Camera access failed:', e);
      throw e;
    }
  }

  stop(): void {
    this.generation++;
    this.pendingStart = null;
    this.videoElement.pause();
    this.videoElement.srcObject = null;
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => track.stop());
      this.currentStream = null;
    }
    this.isRunning = false;
  }

  isActive(): boolean {
    return this.isRunning && !!this.currentStream?.getVideoTracks().some(track => track.readyState === 'live');
  }
}
