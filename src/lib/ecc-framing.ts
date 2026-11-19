
import { encodeBlock, decodeBlock } from './reed-solomon';

const DATA_SYMBOLS_PER_BLOCK = 160;
const PARITY_SYMBOLS_PER_BLOCK = 80;
const LENGTH_HEADER_BYTES = 2;

export const ECC_ENCODED_BLOCK_BYTES = DATA_SYMBOLS_PER_BLOCK + PARITY_SYMBOLS_PER_BLOCK;

export const LENGTH_PREFIX_BYTES = LENGTH_HEADER_BYTES;
export const LENGTH_PREFIX_REPETITIONS = 16;
export const LENGTH_PREFIX_TOTAL_BYTES = LENGTH_HEADER_BYTES * LENGTH_PREFIX_REPETITIONS;

function blockCountFor(dataLength: number): number {
  return Math.max(1, Math.ceil(dataLength / DATA_SYMBOLS_PER_BLOCK));
}

export function encodedBodyLengthFor(payloadLength: number): number {
  return blockCountFor(LENGTH_HEADER_BYTES + payloadLength) * ECC_ENCODED_BLOCK_BYTES;
}

export function encodedLengthFor(payloadLength: number): number {
  return LENGTH_PREFIX_TOTAL_BYTES + encodedBodyLengthFor(payloadLength);
}

export function buildLengthPrefix(bodyLength: number): Uint8Array {
  const prefix = new Uint8Array(LENGTH_PREFIX_TOTAL_BYTES);

  for (let repetition = 0; repetition < LENGTH_PREFIX_REPETITIONS; repetition++) {
    const offset = repetition * LENGTH_HEADER_BYTES;
    prefix[offset] = (bodyLength >>> 8) & 0xff;
    prefix[offset + 1] = bodyLength & 0xff;
  }

  return prefix;
}

export function parseLengthPrefix(prefix: Uint8Array): number | null {
  if (prefix.length < LENGTH_PREFIX_TOTAL_BYTES) {
    return null;
  }

  let highByte = 0;
  let lowByte = 0;

  for (let bit = 0; bit < 8; bit++) {
    let votesHigh = 0;
    let votesLow = 0;

    for (let repetition = 0; repetition < LENGTH_PREFIX_REPETITIONS; repetition++) {
      const offset = repetition * LENGTH_HEADER_BYTES;
      votesHigh += (prefix[offset] >>> (7 - bit)) & 1;
      votesLow += (prefix[offset + 1] >>> (7 - bit)) & 1;
    }

    if (votesHigh > LENGTH_PREFIX_REPETITIONS / 2) {
      highByte |= 1 << (7 - bit);
    }
    if (votesLow > LENGTH_PREFIX_REPETITIONS / 2) {
      lowByte |= 1 << (7 - bit);
    }
  }

  const declaredLength = (highByte << 8) | lowByte;

  return declaredLength > 0 ? declaredLength : null;
}

function interleave(codewords: Uint8Array[]): Uint8Array {
  const blockLength = codewords[0].length;
  const output = new Uint8Array(codewords.length * blockLength);

  let cursor = 0;
  for (let symbol = 0; symbol < blockLength; symbol++) {
    for (let block = 0; block < codewords.length; block++) {
      output[cursor++] = codewords[block][symbol];
    }
  }

  return output;
}

function deinterleave(stream: Uint8Array, blockCount: number): Uint8Array[] {
  const blockLength = stream.length / blockCount;
  const codewords: Uint8Array[] = [];

  for (let block = 0; block < blockCount; block++) {
    codewords.push(new Uint8Array(blockLength));
  }

  let cursor = 0;
  for (let symbol = 0; symbol < blockLength; symbol++) {
    for (let block = 0; block < blockCount; block++) {
      codewords[block][symbol] = stream[cursor++];
    }
  }

  return codewords;
}

export function encodeBody(payload: Uint8Array): Uint8Array {
  const withHeader = new Uint8Array(LENGTH_HEADER_BYTES + payload.length);
  withHeader[0] = (payload.length >>> 8) & 0xff;
  withHeader[1] = payload.length & 0xff;
  withHeader.set(payload, LENGTH_HEADER_BYTES);

  const blockCount = blockCountFor(withHeader.length);
  const codewords: Uint8Array[] = [];

  for (let block = 0; block < blockCount; block++) {
    const dataSymbols = new Uint8Array(DATA_SYMBOLS_PER_BLOCK);
    const start = block * DATA_SYMBOLS_PER_BLOCK;
    dataSymbols.set(withHeader.subarray(start, start + DATA_SYMBOLS_PER_BLOCK), 0);
    codewords.push(encodeBlock(dataSymbols, PARITY_SYMBOLS_PER_BLOCK));
  }

  return interleave(codewords);
}

export function decodeBody(encoded: Uint8Array): Uint8Array | null {
  if (encoded.length === 0 || encoded.length % ECC_ENCODED_BLOCK_BYTES !== 0) {
    return null;
  }

  const blockCount = encoded.length / ECC_ENCODED_BLOCK_BYTES;
  const codewords = deinterleave(encoded, blockCount);
  const recovered: Uint8Array[] = [];

  for (const codeword of codewords) {
    if (decodeBlock(codeword, PARITY_SYMBOLS_PER_BLOCK) === null) {
      return null;
    }
    recovered.push(codeword);
  }

  const dataStream = new Uint8Array(blockCount * DATA_SYMBOLS_PER_BLOCK);

  for (let block = 0; block < blockCount; block++) {
    dataStream.set(
      recovered[block].subarray(0, DATA_SYMBOLS_PER_BLOCK),
      block * DATA_SYMBOLS_PER_BLOCK,
    );
  }

  if (dataStream.length < LENGTH_HEADER_BYTES) {
    return null;
  }

  const declaredLength = (dataStream[0] << 8) | dataStream[1];

  if (declaredLength <= 0 || LENGTH_HEADER_BYTES + declaredLength > dataStream.length) {
    return null;
  }

  return dataStream.subarray(LENGTH_HEADER_BYTES, LENGTH_HEADER_BYTES + declaredLength);
}

export function encodeWithEcc(payload: Uint8Array): Uint8Array {
  const body = encodeBody(payload);
  const combined = new Uint8Array(LENGTH_PREFIX_TOTAL_BYTES + body.length);
  combined.set(buildLengthPrefix(body.length), 0);
  combined.set(body, LENGTH_PREFIX_TOTAL_BYTES);

  return combined;
}

export function payloadCapacityFor(encodedCapacity: number): number {
  const availableForBody = encodedCapacity - LENGTH_PREFIX_TOTAL_BYTES;

  if (availableForBody < ECC_ENCODED_BLOCK_BYTES) {
    return 0;
  }

  const blockCount = Math.floor(availableForBody / ECC_ENCODED_BLOCK_BYTES);

  return blockCount * DATA_SYMBOLS_PER_BLOCK - LENGTH_HEADER_BYTES;
}
