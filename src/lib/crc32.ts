
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);

  for (let tableIndex = 0; tableIndex < 256; tableIndex++) {
    let currentValue = tableIndex;

    for (let bitIndex = 0; bitIndex < 8; bitIndex++) {
      const isLowestBitSet = (currentValue & 1) === 1;
      currentValue = isLowestBitSet ? 0xedb88320 ^ (currentValue >>> 1) : currentValue >>> 1;
    }

    table[tableIndex] = currentValue >>> 0;
  }

  return table;
})();

export function crc32(bytes: Uint8Array, startOffset = 0, endOffset = bytes.length): number {
  let crc = 0xffffffff;

  for (let byteIndex = startOffset; byteIndex < endOffset; byteIndex++) {
    crc = CRC_TABLE[(crc ^ bytes[byteIndex]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}
