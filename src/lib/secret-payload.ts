
const FLAG_HAS_MESSAGE = 1 << 0;
const FLAG_HAS_ATTACHMENT = 1 << 1;
const FIXED_HEADER_BYTE_LENGTH = 21;

export interface HiddenAttachment {
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}

export interface SecretContent {
  message: string;
  attachment: HiddenAttachment | null;
}

export class SecretPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretPayloadError';
  }
}

let textEncoder: TextEncoder | null = null;
let textDecoder: TextDecoder | null = null;

function getTextEncoder(): TextEncoder {
  textEncoder ??= new TextEncoder();
  return textEncoder;
}

function getTextDecoder(): TextDecoder {
  textDecoder ??= new TextDecoder('utf-8', { fatal: true });
  return textDecoder;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function readUint32(source: Uint8Array, offset: number): number {
  return (
    ((source[offset] << 24) |
      (source[offset + 1] << 16) |
      (source[offset + 2] << 8) |
      source[offset + 3]) >>>
    0
  );
}

function writeUint64(target: Uint8Array, offset: number, value: number): void {
  writeUint32(target, offset, Math.floor(value / 0x1_0000_0000));
  writeUint32(target, offset + 4, value >>> 0);
}

function readUint64(source: Uint8Array, offset: number): number {
  return readUint32(source, offset) * 0x1_0000_0000 + readUint32(source, offset + 4);
}

export function serializeSecretContent(content: SecretContent): Uint8Array {
  const messageBytes = getTextEncoder().encode(content.message);
  const fileNameBytes = getTextEncoder().encode(content.attachment?.fileName ?? '');
  const mimeTypeBytes = getTextEncoder().encode(content.attachment?.mimeType ?? '');
  const attachmentBytes = content.attachment?.bytes ?? new Uint8Array(0);

  const totalLength =
    FIXED_HEADER_BYTE_LENGTH +
    messageBytes.length +
    fileNameBytes.length +
    mimeTypeBytes.length +
    attachmentBytes.length;

  const output = new Uint8Array(totalLength);

  let flags = 0;
  if (content.message.length > 0) {
    flags |= FLAG_HAS_MESSAGE;
  }
  if (content.attachment) {
    flags |= FLAG_HAS_ATTACHMENT;
  }
  output[0] = flags;

  writeUint32(output, 1, messageBytes.length);
  writeUint32(output, 5, fileNameBytes.length);
  writeUint32(output, 9, mimeTypeBytes.length);
  writeUint64(output, 13, attachmentBytes.length);

  let cursor = FIXED_HEADER_BYTE_LENGTH;
  output.set(messageBytes, cursor);
  cursor += messageBytes.length;
  output.set(fileNameBytes, cursor);
  cursor += fileNameBytes.length;
  output.set(mimeTypeBytes, cursor);
  cursor += mimeTypeBytes.length;
  output.set(attachmentBytes, cursor);

  return output;
}

export function deserializeSecretContent(bytes: Uint8Array): SecretContent {
  if (bytes.length < FIXED_HEADER_BYTE_LENGTH) {
    throw new SecretPayloadError('The hidden content is corrupt.');
  }

  const flags = bytes[0];
  const messageLength = readUint32(bytes, 1);
  const fileNameLength = readUint32(bytes, 5);
  const mimeTypeLength = readUint32(bytes, 9);
  const attachmentLength = readUint64(bytes, 13);

  const expectedLength =
    FIXED_HEADER_BYTE_LENGTH + messageLength + fileNameLength + mimeTypeLength + attachmentLength;

  if (bytes.length < expectedLength) {
    throw new SecretPayloadError('The hidden content is truncated.');
  }

  let cursor = FIXED_HEADER_BYTE_LENGTH;

  const messageBytes = bytes.subarray(cursor, cursor + messageLength);
  cursor += messageLength;
  const fileNameBytes = bytes.subarray(cursor, cursor + fileNameLength);
  cursor += fileNameLength;
  const mimeTypeBytes = bytes.subarray(cursor, cursor + mimeTypeLength);
  cursor += mimeTypeLength;
  const attachmentBytes = bytes.subarray(cursor, cursor + attachmentLength);

  const attachment =
    (flags & FLAG_HAS_ATTACHMENT) !== 0
      ? {
          fileName: getTextDecoder().decode(fileNameBytes) || 'attachment.bin',
          mimeType: getTextDecoder().decode(mimeTypeBytes) || 'application/octet-stream',
          bytes: new Uint8Array(attachmentBytes),
        }
      : null;

  return {
    message: (flags & FLAG_HAS_MESSAGE) !== 0 ? getTextDecoder().decode(messageBytes) : '',
    attachment,
  };
}

export async function compressSecret(plaintext: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([plaintext as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream('gzip'));

  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function decompressSecret(compressed: Uint8Array): Promise<Uint8Array> {
  try {
    const stream = new Blob([compressed as BlobPart])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'));

    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new SecretPayloadError('Could not decompress the content — it may be corrupt.');
  }
}
