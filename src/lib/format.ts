const BYTE_UNITS = ['bytes', 'KB', 'MB', 'GB'];

export function formatBytes(byteCount: number): string {
  if (byteCount < 1024) {
    return `${byteCount} ${BYTE_UNITS[0]}`;
  }

  let value = byteCount;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < BYTE_UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }

  const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${BYTE_UNITS[unitIndex]}`;
}

export function countCharacters(text: string): number {
  return Array.from(text).length;
}

function stripExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  return lastDotIndex > 0 ? fileName.slice(0, lastDotIndex) : fileName;
}

export function buildEncodedFileName(originalName: string): string {
  return `${stripExtension(originalName)}.png`;
}

export function buildDecodedTextFileName(originalName: string): string {
  return `${stripExtension(originalName)}-revealed.txt`;
}
