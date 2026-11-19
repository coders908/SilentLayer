import type { LuminancePlane } from './spectral-kernel';


interface ProgressEnvelope {
  id: number;
  kind: 'progress';
  ratio: number;
}

interface DoneEnvelope {
  id: number;
  kind: 'done';
  values?: Float32Array;
  bits?: Uint8Array;
}

interface ErrorEnvelope {
  id: number;
  kind: 'error';
  message: string;
}

type WorkerEnvelope = ProgressEnvelope | DoneEnvelope | ErrorEnvelope;

interface PendingRequest {
  resolve: (envelope: DoneEnvelope) => void;
  reject: (error: Error) => void;
  onProgress?: (ratio: number) => void;
}

let workerInstance: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, PendingRequest>();

function getWorker(): Worker {
  if (workerInstance) {
    return workerInstance;
  }

  const worker = new Worker(new URL('../workers/spectral.worker.ts', import.meta.url), {
    type: 'module',
  });

  worker.onmessage = (event: MessageEvent<WorkerEnvelope>) => {
    const envelope = event.data;
    const pending = pendingRequests.get(envelope.id);

    if (!pending) {
      return;
    }

    if (envelope.kind === 'progress') {
      pending.onProgress?.(envelope.ratio);
      return;
    }

    pendingRequests.delete(envelope.id);

    if (envelope.kind === 'error') {
      pending.reject(new Error(envelope.message));
      return;
    }

    pending.resolve(envelope);
  };

  worker.onerror = (event) => {
    const failure = new Error(event.message || 'The frequency layer worker crashed.');

    for (const pending of pendingRequests.values()) {
      pending.reject(failure);
    }

    pendingRequests.clear();
  };

  workerInstance = worker;
  return worker;
}

function sendRequest(
  payload: Record<string, unknown>,
  transfer: Transferable[],
  onProgress?: (ratio: number) => void,
): Promise<DoneEnvelope> {
  const worker = getWorker();
  const requestId = nextRequestId++;

  return new Promise<DoneEnvelope>((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject, onProgress });
    worker.postMessage({ ...payload, id: requestId }, transfer);
  });
}

export async function embedBitsInWorker(
  plane: LuminancePlane,
  bits: Uint8Array,
  scatterSeed: number,
  onProgress?: (ratio: number) => void,
): Promise<Float32Array> {
  const envelope = await sendRequest(
    {
      operation: 'embed',
      width: plane.width,
      height: plane.height,
      values: plane.values,
      bits,
      scatterSeed,
    },
    [plane.values.buffer, bits.buffer],
    onProgress,
  );

  if (!envelope.values) {
    throw new Error('The worker returned no image data.');
  }

  return envelope.values;
}

export async function extractBitsInWorker(
  plane: LuminancePlane,
  bitCount: number,
  scatterSeed: number,
  onProgress?: (ratio: number) => void,
): Promise<Uint8Array> {
  const envelope = await sendRequest(
    {
      operation: 'extract',
      width: plane.width,
      height: plane.height,
      values: plane.values,
      bitCount,
      scatterSeed,
    },
    [plane.values.buffer],
    onProgress,
  );

  if (!envelope.bits) {
    throw new Error('The worker returned no decoded bits.');
  }

  return envelope.bits;
}
