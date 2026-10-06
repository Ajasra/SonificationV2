// Glitch Video & Audio Recorder (MediaRecorder API)
export class VideoRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private isRecording = false;

  startRecording(canvas: HTMLCanvasElement): void {
    this.recordedChunks = [];
    const stream = canvas.captureStream(30);

    const mimeTypes = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'];
    const chosenMime = mimeTypes.find((m) => MediaRecorder.isTypeSupported(m)) || '';

    try {
      this.mediaRecorder = new MediaRecorder(stream, chosenMime ? { mimeType: chosenMime } : undefined);
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };
      this.mediaRecorder.start();
      this.isRecording = true;
    } catch (e) {
      console.error('Failed to start MediaRecorder', e);
    }
  }

  stopRecording(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (!this.mediaRecorder || !this.isRecording) {
        reject(new Error('Recorder not active'));
        return;
      }

      this.mediaRecorder.onstop = () => {
        const mime = this.mediaRecorder?.mimeType || 'video/webm';
        const blob = new Blob(this.recordedChunks, { type: mime });
        this.isRecording = false;
        resolve(blob);
      };

      this.mediaRecorder.stop();
    });
  }

  getIsRecording(): boolean {
    return this.isRecording;
  }
}
