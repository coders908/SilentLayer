
import { EnvelopeKeyError, openEnvelope, sealEnvelope } from './envelope';
import { deriveScatterSeed } from './keyvault';
import {
  ECC_ENCODED_BLOCK_BYTES,
  LENGTH_PREFIX_TOTAL_BYTES,
  decodeBody,
  encodeWithEcc,
  parseLengthPrefix,
  payloadCapacityFor,
} from './ecc-framing';
import { getCarrierGeometry, toLuminancePlane, applyLuminanceDelta } from './image-plane';
import { embedBitsInWorker, extractBitsInWorker } from './spectral-client';
import { bitsToBytes, bytesToBits } from './spectral-kernel';

export { getCarrierGeometry } from './image-plane';

const TRAILER_LENGTH_BYTES = 4;
const PNG_SIGNATURE_LENGTH = 8;

export type ProgressStage = 'preparing' | 'encrypting' | 'embedding';

export type ProgressListener = (stage: ProgressStage, ratio: number) => void;

export class CarrierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CarrierError';
  }
}

function findIendEnd(pngBytes: Uint8Array): number | null {
  let cursor = PNG_SIGNATURE_LENGTH;

  while (cursor + 12 <= pngBytes.length) {
    const dataLength =
      ((pngBytes[cursor] << 24) |
        (pngBytes[cursor + 1] << 16) |
        (pngBytes[cursor + 2] << 8) |
        pngBytes[cursor + 3]) >>>
      0;

    const type = String.fromCharCode(
      pngBytes[cursor + 4],
      pngBytes[cursor + 5],
      pngBytes[cursor + 6],
      pngBytes[cursor + 7],
    );

    if (type === 'IEND') {
      return cursor + 12 + dataLength;
    }

    cursor += 12 + dataLength;
  }

  return null;
}

export function appendEnvelopeToPng(pngBytes: Uint8Array, envelope: Uint8Array): Uint8Array {
  const iendEnd = findIendEnd(pngBytes);

  if (iendEnd === null) {
    throw new CarrierError('The PNG file is corrupt.');
  }

  const output = new Uint8Array(iendEnd + envelope.length + TRAILER_LENGTH_BYTES);
  output.set(pngBytes.subarray(0, iendEnd), 0);
  output.set(envelope, iendEnd);

  const lengthOffset = iendEnd + envelope.length;
  output[lengthOffset] = (envelope.length >>> 24) & 0xff;
  output[lengthOffset + 1] = (envelope.length >>> 16) & 0xff;
  output[lengthOffset + 2] = (envelope.length >>> 8) & 0xff;
  output[lengthOffset + 3] = envelope.length & 0xff;

  return output;
}

export function readAppendedEnvelope(pngBytes: Uint8Array): Uint8Array | null {
  const iendEnd = findIendEnd(pngBytes);

  if (iendEnd === null) {
    return null;
  }

  const trailerStart = pngBytes.length - TRAILER_LENGTH_BYTES;

  if (trailerStart < iendEnd) {
    return null;
  }

  const declaredLength =
    ((pngBytes[trailerStart] << 24) |
      (pngBytes[trailerStart + 1] << 16) |
      (pngBytes[trailerStart + 2] << 8) |
      pngBytes[trailerStart + 3]) >>>
    0;

  if (declaredLength <= 0 || declaredLength > trailerStart - iendEnd) {
    return null;
  }

  return pngBytes.subarray(trailerStart - declaredLength, trailerStart);
}

function frameForSpectral(envelope: Uint8Array): Uint8Array {
  return encodeWithEcc(envelope);
}

export interface RuggedCapacity {
  capacityInBytes: number;
  usableBytes: number;
}

export function getRuggedCapacity(
  width: number,
  height: number,
  envelopeOverheadBytes: number,
): RuggedCapacity {
  const { byteCapacity } = getCarrierGeometry(width, height);
  const plaintextBytes = payloadCapacityFor(byteCapacity);

  return {
    capacityInBytes: byteCapacity,
    usableBytes: Math.max(0, plaintextBytes - envelopeOverheadBytes),
  };
}

async function rasterizeImageData(imageData: ImageData): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;

  const context = canvas.getContext('2d', { willReadFrequently: true });

  if (!context) {
    throw new CarrierError('The browser could not create a canvas.');
  }

  context.putImageData(imageData, 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png');
  });

  if (!blob) {
    throw new CarrierError('Creating the PNG file failed.');
  }

  return new Uint8Array(await blob.arrayBuffer());
}

export interface EmbedOptions {
  pngBytes: Uint8Array;
  imageData: ImageData;
  plaintext: Uint8Array;
  includeRuggedChannel: boolean;
  passphrase?: string | null;
  onProgress?: ProgressListener;
}

export interface EmbedOutcome {
  pngBytes: Uint8Array;
  ruggedChannelUsed: boolean;
  stealthByteLength: number;
  ruggedByteLength: number;
}

export async function embedSecret(options: EmbedOptions): Promise<EmbedOutcome> {
  options.onProgress?.('encrypting', 0);

  const envelope = await sealEnvelope(options.plaintext, {
    passphrase: options.passphrase ?? null,
  });
  const scatterSeed = await deriveScatterSeed();

  let ruggedChannelUsed = false;
  let ruggedByteLength = 0;
  let carrierPngBytes = options.pngBytes;

  const framedForSpectral = frameForSpectral(envelope);
  const geometry = getCarrierGeometry(options.imageData.width, options.imageData.height);

  const spectralFits = framedForSpectral.length * 8 <= geometry.bitCapacity;

  if (options.includeRuggedChannel && spectralFits) {
    try {
      options.onProgress?.('embedding', 0);

      const originalPlane = toLuminancePlane(options.imageData);
      const bits = bytesToBits(framedForSpectral);

      const carriedValues = await embedBitsInWorker(
        {
          width: originalPlane.width,
          height: originalPlane.height,
          values: new Float32Array(originalPlane.values),
        },
        bits,
        scatterSeed,
        (ratio) => options.onProgress?.('embedding', ratio),
      );

      const carriedImageData = applyLuminanceDelta(options.imageData, originalPlane, {
        width: originalPlane.width,
        height: originalPlane.height,
        values: carriedValues,
      });

      carrierPngBytes = await rasterizeImageData(carriedImageData);
      ruggedChannelUsed = true;
      ruggedByteLength = envelope.length;
    } catch {
      carrierPngBytes = options.pngBytes;
      ruggedChannelUsed = false;
      ruggedByteLength = 0;
    }
  }

  return {
    pngBytes: appendEnvelopeToPng(carrierPngBytes, envelope),
    ruggedChannelUsed,
    stealthByteLength: envelope.length,
    ruggedByteLength,
  };
}

export interface ExtractOptions {
  pngBytes: Uint8Array;
  imageData: ImageData;
  passphrase?: string | null;
  onProgress?: ProgressListener;
}

export interface ExtractOutcome {
  plaintext: Uint8Array;
  channel: 'stealth' | 'rugged';
}

export async function extractSecret(options: ExtractOptions): Promise<ExtractOutcome> {
  const stealthEnvelope = readAppendedEnvelope(options.pngBytes);

  if (stealthEnvelope) {
    try {
      return {
        plaintext: await openEnvelope(stealthEnvelope, {
          passphrase: options.passphrase ?? null,
        }),
        channel: 'stealth',
      };
    } catch (error) {
      if (error instanceof EnvelopeKeyError) {
        throw error;
      }
    }
  }

  options.onProgress?.('embedding', 0);

  const scatterSeed = await deriveScatterSeed();
  const plane = toLuminancePlane(options.imageData);
  const geometry = getCarrierGeometry(plane.width, plane.height);

  if (geometry.bitCapacity < LENGTH_PREFIX_TOTAL_BYTES * 8) {
    throw new CarrierError('The image is too small to hold a frequency layer.');
  }

  const prefixBits = await extractBitsInWorker(
    { width: plane.width, height: plane.height, values: new Float32Array(plane.values) },
    LENGTH_PREFIX_TOTAL_BYTES * 8,
    scatterSeed,
  );
  const prefixBytes = bitsToBytes(
    prefixBits,
    LENGTH_PREFIX_TOTAL_BYTES,
  );

  const declaredBodyLength = parseLengthPrefix(prefixBytes);

  if (!declaredBodyLength) {
    throw new CarrierError(
      'No hidden content was found in this image. If it was heavily compressed, the layer may have been lost.',
    );
  }

  if (declaredBodyLength % ECC_ENCODED_BLOCK_BYTES !== 0) {
    throw new CarrierError('No valid hidden content was found in this image.');
  }

  const totalBytes = LENGTH_PREFIX_TOTAL_BYTES + declaredBodyLength;

  if (totalBytes * 8 > geometry.bitCapacity) {
    throw new CarrierError('The hidden content is larger than this image can carry.');
  }

  const bodyBits = await extractBitsInWorker(
    { width: plane.width, height: plane.height, values: new Float32Array(plane.values) },
    totalBytes * 8,
    scatterSeed,
    (ratio) => options.onProgress?.('embedding', ratio),
  );
  const allBytes = bitsToBytes(bodyBits, totalBytes);
  const body = allBytes.subarray(LENGTH_PREFIX_TOTAL_BYTES);

  const payload = decodeBody(body);

  if (!payload) {
    throw new CarrierError(
      'The content in the frequency layer is damaged beyond repair. Try the original PNG file.',
    );
  }

  return {
    plaintext: await openEnvelope(payload, { passphrase: options.passphrase ?? null }),
    channel: 'rugged',
  };
}
