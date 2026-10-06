// Camera Manager: Webcam (Desktop) and Rear/Front Camera (Mobile)
export class CameraManager {
  private videoElement: HTMLVideoElement;
  private currentStream: MediaStream | null = null;
  private facingMode: 'user' | 'environment' = 'environment';
  private isRunning = false;

  constructor() {
    this.videoElement = document.createElement('video');
    this.videoElement.autoplay = true;
    this.videoElement.playsInline = true;
    this.videoElement.muted = true;
  }

  getVideoElement(): HTMLVideoElement {
    return this.videoElement;
  }

  getFacingMode(): 'user' | 'environment' {
    return this.facingMode;
  }

  async toggleFacingMode(): Promise<void> {
    this.facingMode = this.facingMode === 'user' ? 'environment' : 'user';
    if (this.isRunning) {
      await this.start();
    }
  }

  async start(preferredWidth = 640, preferredHeight = 480): Promise<void> {
    this.stop();

    try {
      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: this.facingMode },
          width: { ideal: preferredWidth },
          height: { ideal: preferredHeight },
        },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.currentStream = stream;
      this.videoElement.srcObject = stream;
      await this.videoElement.play();
      this.isRunning = true;
    } catch (e) {
      console.error('Camera access failed:', e);
      throw e;
    }
  }

  stop(): void {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => track.stop());
      this.currentStream = null;
    }
    this.isRunning = false;
  }

  isActive(): boolean {
    return this.isRunning && this.videoElement.readyState >= 2;
  }
}
