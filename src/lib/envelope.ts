
import { deriveEnvelopeKey } from './keyvault';

export const ENVELOPE_SALT_BYTES = 16;
export const ENVELOPE_IV_BYTES = 12;
export const ENVELOPE_TAG_BYTES = 16;
const ENVELOPE_OVERHEAD_BYTES = ENVELOPE_SALT_BYTES + ENVELOPE_IV_BYTES + ENVELOPE_TAG_BYTES;

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvelopeError';
  }
}

export function getEnvelopeOverhead(): number {
  return ENVELOPE_OVERHEAD_BYTES;
}

export async function sealEnvelope(plaintext: Uint8Array): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(ENVELOPE_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(ENVELOPE_IV_BYTES));
  const key = await deriveEnvelopeKey(salt);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: ENVELOPE_TAG_BYTES * 8 },
    key,
    plaintext as BufferSource,
  );

  const envelope = new Uint8Array(ENVELOPE_SALT_BYTES + ENVELOPE_IV_BYTES + ciphertext.byteLength);
  envelope.set(salt, 0);
  envelope.set(iv, ENVELOPE_SALT_BYTES);
  envelope.set(new Uint8Array(ciphertext), ENVELOPE_SALT_BYTES + ENVELOPE_IV_BYTES);

  return envelope;
}

export async function openEnvelope(envelope: Uint8Array): Promise<Uint8Array> {
  if (envelope.length <= ENVELOPE_OVERHEAD_BYTES) {
    throw new EnvelopeError('There is no readable hidden content here.');
  }

  const salt = envelope.subarray(0, ENVELOPE_SALT_BYTES);
  const iv = envelope.subarray(ENVELOPE_SALT_BYTES, ENVELOPE_SALT_BYTES + ENVELOPE_IV_BYTES);
  const ciphertext = envelope.subarray(ENVELOPE_SALT_BYTES + ENVELOPE_IV_BYTES);
  const key = await deriveEnvelopeKey(salt);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, tagLength: ENVELOPE_TAG_BYTES * 8 },
      key,
      ciphertext as BufferSource,
    );

    return new Uint8Array(plaintext);
  } catch {
    throw new EnvelopeError('The content cannot be read with this key.');
  }
}
