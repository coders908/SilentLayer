
import {
  decideBitsFromChips,
  embedBitsIntoPlane,
  extractChipsFromPlane,
  type LuminancePlane,
} from '../lib/spectral-kernel';

interface EmbedRequest {
  id: number;
  operation: 'embed';
  width: number;
  height: number;
  values: Float32Array;
  bits: Uint8Array;
  scatterSeed: number;
}

interface ExtractRequest {
  id: number;
  operation: 'extract';
  width: number;
  height: number;
  values: Float32Array;
  bitCount: number;
  scatterSeed: number;
}

type WorkerRequest = EmbedRequest | ExtractRequest;

interface ProgressResponse {
  id: number;
  kind: 'progress';
  ratio: number;
}

interface EmbedDoneResponse {
  id: number;
  kind: 'done';
  values: Float32Array;
}

interface ExtractDoneResponse {
  id: number;
  kind: 'done';
  bits: Uint8Array;
}

interface ErrorResponse {
  id: number;
  kind: 'error';
  message: string;
}

type WorkerResponse = ProgressResponse | EmbedDoneResponse | ExtractDoneResponse | ErrorResponse;

interface WorkerScope {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage: (message: WorkerResponse, transfer?: Transferable[]) => void;
}

const workerScope = self as unknown as WorkerScope;

function postMessageToHost(message: WorkerResponse, transfer?: Transferable[]): void {
  workerScope.postMessage(message, transfer ?? []);
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  const plane: LuminancePlane = {
    width: request.width,
    height: request.height,
    values: request.values,
  };

  const reportProgress = (ratio: number) => {
    postMessageToHost({ id: request.id, kind: 'progress', ratio });
  };

  try {
    if (request.operation === 'embed') {
      const carried = embedBitsIntoPlane(plane, request.bits, request.scatterSeed, reportProgress);
      postMessageToHost({ id: request.id, kind: 'done', values: carried.values }, [
        carried.values.buffer,
      ]);
      return;
    }

    const chips = extractChipsFromPlane(
      plane,
      request.bitCount,
      request.scatterSeed,
      reportProgress,
    );
    const bits = decideBitsFromChips(chips, request.bitCount);
    postMessageToHost({ id: request.id, kind: 'done', bits }, [bits.buffer]);
  } catch (error) {
    postMessageToHost({
      id: request.id,
      kind: 'error',
      message: error instanceof Error ? error.message : 'The frequency layer failed.',
    });
  }
};
