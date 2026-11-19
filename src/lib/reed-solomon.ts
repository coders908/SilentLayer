
const PRIMITIVE_POLYNOMIAL = 0x11d;
const FIELD_SIZE = 256;
const MAX_CODEWORD = 255;

const EXP_TABLE = new Uint8Array(FIELD_SIZE * 2);
const LOG_TABLE = new Uint8Array(FIELD_SIZE);

(function buildFieldTables() {
  let value = 1;

  for (let index = 0; index < MAX_CODEWORD; index++) {
    EXP_TABLE[index] = value;
    LOG_TABLE[value] = index;
    value <<= 1;

    if (value & 0x100) {
      value ^= PRIMITIVE_POLYNOMIAL;
    }
  }

  for (let index = MAX_CODEWORD; index < EXP_TABLE.length; index++) {
    EXP_TABLE[index] = EXP_TABLE[index - MAX_CODEWORD];
  }
})();

function multiply(left: number, right: number): number {
  if (left === 0 || right === 0) {
    return 0;
  }

  return EXP_TABLE[(LOG_TABLE[left] + LOG_TABLE[right]) % MAX_CODEWORD];
}

function divide(dividend: number, divisor: number): number {
  if (divisor === 0) {
    throw new Error('Division by zero in the Galois field.');
  }
  if (dividend === 0) {
    return 0;
  }

  return EXP_TABLE[(LOG_TABLE[dividend] + MAX_CODEWORD - LOG_TABLE[divisor]) % MAX_CODEWORD];
}

function exponentiate(base: number, power: number): number {
  if (power === 0) {
    return 1;
  }
  if (base === 0) {
    return 0;
  }

  return EXP_TABLE[(LOG_TABLE[base] * power) % MAX_CODEWORD];
}

function locationOf(position: number, codewordLength: number): number {
  return EXP_TABLE[(codewordLength - 1 - position + MAX_CODEWORD) % MAX_CODEWORD];
}

function buildGeneratorPolynomial(paritySymbols: number): Uint8Array {
  let generator = new Uint8Array([1]);

  for (let degree = 0; degree < paritySymbols; degree++) {
    const next = new Uint8Array(generator.length + 1);
    const root = EXP_TABLE[degree];

    for (let index = 0; index < generator.length; index++) {
      next[index] ^= generator[index];
      next[index + 1] ^= multiply(generator[index], root);
    }

    generator = next;
  }

  return generator;
}

export function encodeBlock(data: Uint8Array, paritySymbols: number): Uint8Array {
  if (data.length + paritySymbols > MAX_CODEWORD) {
    throw new Error('The block is too large for error-correction encoding.');
  }

  const generator = buildGeneratorPolynomial(paritySymbols);
  const working = new Uint8Array(data.length + paritySymbols);
  working.set(data, 0);

  for (let index = 0; index < data.length; index++) {
    const coefficient = working[index];

    if (coefficient === 0) {
      continue;
    }

    for (let offset = 0; offset < generator.length; offset++) {
      working[index + offset] ^= multiply(generator[offset], coefficient);
    }
  }

  const codeword = new Uint8Array(data.length + paritySymbols);
  codeword.set(data, 0);
  codeword.set(working.subarray(data.length), data.length);

  return codeword;
}

function computeSyndromes(codeword: Uint8Array, paritySymbols: number): Uint8Array {
  const syndromes = new Uint8Array(paritySymbols);

  for (let index = 0; index < paritySymbols; index++) {
    const evaluationPoint = EXP_TABLE[index];
    let accumulator = 0;

    for (let position = 0; position < codeword.length; position++) {
      accumulator = multiply(accumulator, evaluationPoint) ^ codeword[position];
    }

    syndromes[index] = accumulator;
  }

  return syndromes;
}

function allZero(values: Uint8Array): boolean {
  for (let index = 0; index < values.length; index++) {
    if (values[index] !== 0) {
      return false;
    }
  }

  return true;
}

function findErrorLocator(syndromes: Uint8Array): Uint8Array | null {
  let locator = new Uint8Array([1]);
  let previousLocator = new Uint8Array([1]);
  let errorCount = 0;
  let shift = 1;
  let previousDiscrepancy = 1;

  for (let iteration = 0; iteration < syndromes.length; iteration++) {
    let discrepancy = syndromes[iteration];

    for (let index = 1; index <= errorCount; index++) {
      if (index < locator.length) {
        discrepancy ^= multiply(locator[index], syndromes[iteration - index]);
      }
    }

    if (discrepancy === 0) {
      shift++;
      continue;
    }

    const preservedLocator = new Uint8Array(locator);

    if (locator.length < previousLocator.length + shift) {
      const grown = new Uint8Array(previousLocator.length + shift);
      grown.set(locator, 0);
      locator = grown;
    }

    const scale = divide(discrepancy, previousDiscrepancy);

    for (let index = 0; index < previousLocator.length; index++) {
      locator[index + shift] ^= multiply(scale, previousLocator[index]);
    }

    if (2 * errorCount <= iteration) {
      errorCount = iteration + 1 - errorCount;
      previousLocator = preservedLocator;
      previousDiscrepancy = discrepancy;
      shift = 1;
    } else {
      shift++;
    }
  }

  let trimmedLength = locator.length;
  while (trimmedLength > 1 && locator[trimmedLength - 1] === 0) {
    trimmedLength--;
  }

  const trimmed = locator.subarray(0, trimmedLength);

  if (trimmed.length !== errorCount + 1) {
    return null;
  }

  return new Uint8Array(trimmed);
}

function findErrorPositions(locator: Uint8Array, codewordLength: number): number[] | null {
  const errorCount = locator.length - 1;
  const positions: number[] = [];

  for (let k = 0; k < codewordLength; k++) {
    const evaluationPoint = EXP_TABLE[(MAX_CODEWORD - k) % MAX_CODEWORD];

    let value = 0;
    for (let index = 0; index < locator.length; index++) {
      value ^= multiply(locator[index], exponentiate(evaluationPoint, index));
    }

    if (value === 0) {
      positions.push(codewordLength - 1 - k);
    }
  }

  return positions.length === errorCount ? positions : null;
}

function solveErrorMagnitudes(
  syndromes: Uint8Array,
  positions: number[],
  codewordLength: number,
): number[] | null {
  const errorCount = positions.length;

  if (errorCount === 0) {
    return [];
  }

  const matrix: Uint8Array[] = [];

  for (let row = 0; row < errorCount; row++) {
    const coefficients = new Uint8Array(errorCount + 1);

    for (let column = 0; column < errorCount; column++) {
      const location = locationOf(positions[column], codewordLength);
      coefficients[column] = exponentiate(location, row);
    }

    coefficients[errorCount] = syndromes[row];
    matrix.push(coefficients);
  }

  for (let pivot = 0; pivot < errorCount; pivot++) {
    let pivotRow = -1;

    for (let row = pivot; row < errorCount; row++) {
      if (matrix[row][pivot] !== 0) {
        pivotRow = row;
        break;
      }
    }

    if (pivotRow === -1) {
      return null;
    }

    const held = matrix[pivot];
    matrix[pivot] = matrix[pivotRow];
    matrix[pivotRow] = held;

    const pivotInverse = divide(1, matrix[pivot][pivot]);

    for (let column = pivot; column <= errorCount; column++) {
      matrix[pivot][column] = multiply(matrix[pivot][column], pivotInverse);
    }

    for (let row = 0; row < errorCount; row++) {
      if (row === pivot) {
        continue;
      }

      const factor = matrix[row][pivot];
      if (factor === 0) {
        continue;
      }

      for (let column = pivot; column <= errorCount; column++) {
        matrix[row][column] ^= multiply(factor, matrix[pivot][column]);
      }
    }
  }

  const magnitudes: number[] = [];
  for (let row = 0; row < errorCount; row++) {
    magnitudes.push(matrix[row][errorCount]);
  }

  return magnitudes;
}

export function decodeBlock(codeword: Uint8Array, paritySymbols: number): number | null {
  const syndromes = computeSyndromes(codeword, paritySymbols);

  if (allZero(syndromes)) {
    return 0;
  }

  const locator = findErrorLocator(syndromes);

  if (!locator) {
    return null;
  }

  const positions = findErrorPositions(locator, codeword.length);

  if (!positions) {
    return null;
  }

  if (positions.length > Math.floor(paritySymbols / 2)) {
    return null;
  }

  const magnitudes = solveErrorMagnitudes(syndromes, positions, codeword.length);

  if (!magnitudes) {
    return null;
  }

  for (let index = 0; index < positions.length; index++) {
    codeword[positions[index]] ^= magnitudes[index];
  }

  return allZero(computeSyndromes(codeword, paritySymbols)) ? positions.length : null;
}
