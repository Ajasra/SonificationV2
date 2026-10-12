// Preflight needs a frozen decoded frame, independent of paused-video backing.
export function snapshotVideoFrame(video:HTMLVideoElement, signal:AbortSignal):Promise<ImageBitmap> {
  return new Promise((resolve,reject)=>{
    let callback:number | undefined, settled=false;
    const cleanup=()=>{clearTimeout(timeout);signal.removeEventListener('abort',abort);if(callback!==undefined)video.cancelVideoFrameCallback(callback);video.pause();};
    const fail=(error:unknown)=>{if(settled)return;settled=true;cleanup();reject(error);};
    const abort=()=>fail(new Error('Video snapshot cancelled'));
    const timeout=setTimeout(()=>fail(new Error('Timed out waiting for a decoded video frame')),15000);
    signal.addEventListener('abort',abort,{once:true});
    if(signal.aborted){abort();return;}
    callback=video.requestVideoFrameCallback(()=>{
      callback=undefined;
      void createImageBitmap(video).then(bitmap=>{
        if(settled){bitmap.close();return;}
        settled=true;cleanup();resolve(bitmap);
      },fail);
    });
    void video.play().catch(fail);
  });
}
