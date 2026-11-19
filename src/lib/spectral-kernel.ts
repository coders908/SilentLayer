
export const BLOCK_SIZE = 8;

export const QUANTIZATION_STEP = 40;

const DITHER_LOW = -QUANTIZATION_STEP / 4;
const DITHER_HIGH = QUANTIZATION_STEP / 4;

export const SPECTRAL_REPETITION = 48;

const CARRIER_COEFFICIENTS: ReadonlyArray<readonly [number, number]> = [
  [1, 2], [2, 1], [2, 2], [1, 3], [3, 1], [2, 3],
  [3, 2], [1, 4], [4, 1], [3, 3], [2, 4], [4, 2],
];

const DCT_COSINE = (() => {
  const table = new Float64Array(BLOCK_SIZE * BLOCK_SIZE);

  for (let frequency = 0; frequency < BLOCK_SIZE; frequency++) {
    const scale =
      frequency === 0 ? Math.sqrt(1 / BLOCK_SIZE) : Math.sqrt(2 / BLOCK_SIZE);

    for (let position = 0; position < BLOCK_SIZE; position++) {
      table[frequency * BLOCK_SIZE + position] =
        scale * Math.cos(((2 * position + 1) * frequency * Math.PI) / (2 * BLOCK_SIZE));
    }
  }

  return table;
})();

const PROGRESS_REPORT_INTERVAL_BLOCKS = 256;

export type ProgressReporter = (completedRatio: number) => void;

function createKeyedRandom(seed: number): () => number {
  let state = seed >>> 0;
  if (state === 0) {
    state = 0x9e3779b9;
  }

  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };
}

export interface CarrierGeometry {
  blocksAcross: number;
  blocksDown: number;
  chipCount: number;
  bitCapacity: number;
  byteCapacity: number;
}

export function getCarrierGeometry(width: number, height: number): CarrierGeometry {
  const blocksAcross = Math.floor(width / BLOCK_SIZE);
  const blocksDown = Math.floor(height / BLOCK_SIZE);
  const chipCount = blocksAcross * blocksDown * CARRIER_COEFFICIENTS.length;
  const bitCapacity = Math.floor(chipCount / SPECTRAL_REPETITION);

  return {
    blocksAcross,
    blocksDown,
    chipCount,
    bitCapacity,
    byteCapacity: Math.floor(bitCapacity / 8),
  };
}

function buildSlotOrder(chipCount: number, seed: number): Uint32Array {
  const slotOrder = new Uint32Array(chipCount);

  for (let slot = 0; slot < chipCount; slot++) {
    slotOrder[slot] = slot;
  }

  const nextRandom = createKeyedRandom(seed);

  for (let slot = chipCount - 1; slot > 0; slot--) {
    const swapIndex = nextRandom() % (slot + 1);
    const held = slotOrder[slot];
    slotOrder[slot] = slotOrder[swapIndex];
    slotOrder[swapIndex] = held;
  }

  return slotOrder;
}

function forwardBlockDct(pixels: Float64Array, coefficients: Float64Array): void {
  const intermediate = new Float64Array(BLOCK_SIZE * BLOCK_SIZE);

  for (let row = 0; row < BLOCK_SIZE; row++) {
    for (let frequency = 0; frequency < BLOCK_SIZE; frequency++) {
      let sum = 0;
      for (let position = 0; position < BLOCK_SIZE; position++) {
        sum += pixels[row * BLOCK_SIZE + position] * DCT_COSINE[frequency * BLOCK_SIZE + position];
      }
      intermediate[row * BLOCK_SIZE + frequency] = sum;
    }
  }

  for (let column = 0; column < BLOCK_SIZE; column++) {
    for (let frequency = 0; frequency < BLOCK_SIZE; frequency++) {
      let sum = 0;
      for (let position = 0; position < BLOCK_SIZE; position++) {
        sum +=
          intermediate[position * BLOCK_SIZE + column] *
          DCT_COSINE[frequency * BLOCK_SIZE + position];
      }
      coefficients[frequency * BLOCK_SIZE + column] = sum;
    }
  }
}

function inverseBlockDct(coefficients: Float64Array, pixels: Float64Array): void {
  const intermediate = new Float64Array(BLOCK_SIZE * BLOCK_SIZE);

  for (let column = 0; column < BLOCK_SIZE; column++) {
    for (let position = 0; position < BLOCK_SIZE; position++) {
      let sum = 0;
      for (let frequency = 0; frequency < BLOCK_SIZE; frequency++) {
        sum +=
          coefficients[frequency * BLOCK_SIZE + column] *
          DCT_COSINE[frequency * BLOCK_SIZE + position];
      }
      intermediate[position * BLOCK_SIZE + column] = sum;
    }
  }

  for (let row = 0; row < BLOCK_SIZE; row++) {
    for (let position = 0; position < BLOCK_SIZE; position++) {
      let sum = 0;
      for (let frequency = 0; frequency < BLOCK_SIZE; frequency++) {
        sum +=
          intermediate[row * BLOCK_SIZE + frequency] *
          DCT_COSINE[frequency * BLOCK_SIZE + position];
      }
      pixels[row * BLOCK_SIZE + position] = sum;
    }
  }
}

function ditherModulate(coefficient: number, bit: number): number {
  const target = bit === 1 ? DITHER_HIGH : DITHER_LOW;
  return QUANTIZATION_STEP * Math.round((coefficient - target) / QUANTIZATION_STEP) + target;
}

function softDemodulate(coefficient: number): number {
  return coefficient - QUANTIZATION_STEP * Math.round(coefficient / QUANTIZATION_STEP);
}

export function bytesToBits(bytes: Uint8Array): Uint8Array {
  const bits = new Uint8Array(bytes.length * 8);

  for (let byteIndex = 0; byteIndex < bytes.length; byteIndex++) {
    const byteValue = bytes[byteIndex];
    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      bits[byteIndex * 8 + bitIndex] = (byteValue >>> (7 - bitIndex)) & 1;
    }
  }

  return bits;
}

export function bitsToBytes(bits: Uint8Array, byteLength: number): Uint8Array {
  const bytes = new Uint8Array(byteLength);

  for (let byteIndex = 0; byteIndex < byteLength; byteIndex++) {
    let byteValue = 0;
    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      byteValue = (byteValue << 1) | bits[byteIndex * 8 + bitIndex];
    }
    bytes[byteIndex] = byteValue;
  }

  return bytes;
}

export interface LuminancePlane {
  width: number;
  height: number;
  values: Float32Array;
}

interface PendingWrite {
  coefficientOffset: number;
  bitValue: number;
}

export function embedBitsIntoPlane(
  plane: LuminancePlane,
  bits: Uint8Array,
  scatterSeed: number,
  onProgress?: ProgressReporter,
): LuminancePlane {
  const geometry = getCarrierGeometry(plane.width, plane.height);
  const neededChips = bits.length * SPECTRAL_REPETITION;

  if (neededChips > geometry.chipCount) {
    throw new Error('The content is too large for the resilient hiding layer.');
  }

  const output = new Float32Array(plane.values);
  const slotOrder = buildSlotOrder(geometry.chipCount, scatterSeed);
  const writesByBlock = new Map<number, PendingWrite[]>();

  for (let chip = 0; chip < neededChips; chip++) {
    const slot = slotOrder[chip];
    const blockIndex = Math.floor(slot / CARRIER_COEFFICIENTS.length);
    const coefficientIndex = slot % CARRIER_COEFFICIENTS.length;
    const bitValue = bits[Math.floor(chip / SPECTRAL_REPETITION)];
    const [row, column] = CARRIER_COEFFICIENTS[coefficientIndex];

    let blockWrites = writesByBlock.get(blockIndex);

    if (!blockWrites) {
      blockWrites = [];
      writesByBlock.set(blockIndex, blockWrites);
    }

    blockWrites.push({ coefficientOffset: row * BLOCK_SIZE + column, bitValue });
  }

  const pixels = new Float64Array(BLOCK_SIZE * BLOCK_SIZE);
  const coefficients = new Float64Array(BLOCK_SIZE * BLOCK_SIZE);
  let processedBlocks = 0;

  for (const [blockIndex, blockWrites] of writesByBlock) {
    const originX = (blockIndex % geometry.blocksAcross) * BLOCK_SIZE;
    const originY = Math.floor(blockIndex / geometry.blocksAcross) * BLOCK_SIZE;

    for (let row = 0; row < BLOCK_SIZE; row++) {
      for (let column = 0; column < BLOCK_SIZE; column++) {
        pixels[row * BLOCK_SIZE + column] =
          plane.values[(originY + row) * plane.width + originX + column];
      }
    }

    forwardBlockDct(pixels, coefficients);

    for (const write of blockWrites) {
      coefficients[write.coefficientOffset] = ditherModulate(
        coefficients[write.coefficientOffset],
        write.bitValue,
      );
    }

    inverseBlockDct(coefficients, pixels);

    for (let row = 0; row < BLOCK_SIZE; row++) {
      for (let column = 0; column < BLOCK_SIZE; column++) {
        const pixelIndex = (originY + row) * plane.width + originX + column;
        output[pixelIndex] = Math.min(255, Math.max(0, pixels[row * BLOCK_SIZE + column]));
      }
    }

    processedBlocks++;

    if (onProgress && processedBlocks % PROGRESS_REPORT_INTERVAL_BLOCKS === 0) {
      onProgress(processedBlocks / writesByBlock.size);
    }
  }

  onProgress?.(1);

  return { width: plane.width, height: plane.height, values: output };
}

export function extractChipsFromPlane(
  plane: LuminancePlane,
  bitCount: number,
  scatterSeed: number,
  onProgress?: ProgressReporter,
): Float32Array {
  const geometry = getCarrierGeometry(plane.width, plane.height);
  const neededChips = bitCount * SPECTRAL_REPETITION;

  if (neededChips > geometry.chipCount) {
    throw new Error('The image is too small to hold the frequency layer.');
  }

  const slotOrder = buildSlotOrder(geometry.chipCount, scatterSeed);
  const chips = new Float32Array(neededChips);
  const pixels = new Float64Array(BLOCK_SIZE * BLOCK_SIZE);
  const coefficients = new Float64Array(BLOCK_SIZE * BLOCK_SIZE);
  const decodedBlocks = new Map<number, Float64Array>();
  const blocksNeeded = Math.ceil(neededChips / CARRIER_COEFFICIENTS.length);

  for (let chip = 0; chip < neededChips; chip++) {
    const slot = slotOrder[chip];
    const blockIndex = Math.floor(slot / CARRIER_COEFFICIENTS.length);
    const coefficientIndex = slot % CARRIER_COEFFICIENTS.length;

    let blockCoefficients = decodedBlocks.get(blockIndex);

    if (!blockCoefficients) {
      const originX = (blockIndex % geometry.blocksAcross) * BLOCK_SIZE;
      const originY = Math.floor(blockIndex / geometry.blocksAcross) * BLOCK_SIZE;

      for (let row = 0; row < BLOCK_SIZE; row++) {
        for (let column = 0; column < BLOCK_SIZE; column++) {
          pixels[row * BLOCK_SIZE + column] =
            plane.values[(originY + row) * plane.width + originX + column];
        }
      }

      forwardBlockDct(pixels, coefficients);
      blockCoefficients = new Float64Array(coefficients);
      decodedBlocks.set(blockIndex, blockCoefficients);

      if (onProgress && decodedBlocks.size % PROGRESS_REPORT_INTERVAL_BLOCKS === 0) {
        onProgress(Math.min(1, decodedBlocks.size / blocksNeeded));
      }
    }

    const [row, column] = CARRIER_COEFFICIENTS[coefficientIndex];
    chips[chip] = softDemodulate(blockCoefficients[row * BLOCK_SIZE + column]);
  }

  onProgress?.(1);

  return chips;
}

export function decideBitsFromChips(chips: Float32Array, bitCount: number): Uint8Array {
  const bits = new Uint8Array(bitCount);

  for (let bit = 0; bit < bitCount; bit++) {
    let accumulator = 0;
    const start = bit * SPECTRAL_REPETITION;

    for (let offset = 0; offset < SPECTRAL_REPETITION; offset++) {
      accumulator += chips[start + offset];
    }

    bits[bit] = accumulator > 0 ? 1 : 0;
  }

  return bits;
}
