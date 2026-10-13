import { TShiftRFilter } from '../filters/distortion/shiftr.ts';

const filter = new TShiftRFilter(44100);
const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<{ id: number; samples: ArrayBuffer }>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
workerScope.onmessage = (event: MessageEvent<{ id: number; samples: ArrayBuffer }>) => {
  const { id, samples } = event.data;
  const block = new Float32Array(samples);
  filter.processBlock(block);
  workerScope.postMessage({ id, samples: block.buffer }, [block.buffer]);
};
