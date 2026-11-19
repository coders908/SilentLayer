
import { deriveEnvelopeKey, derivePassphraseKey } from './keyvault';


export const ENVELOPE_FORMAT_VERSION = 1;

export const ENVELOPE_SALT_BYTES = 16;
export const ENVELOPE_IV_BYTES = 12;
export const ENVELOPE_TAG_BYTES = 16;
export const ENVELOPE_HEADER_BYTES = 2 + ENVELOPE_SALT_BYTES + ENVELOPE_IV_BYTES;
const ENVELOPE_OVERHEAD_BYTES = ENVELOPE_HEADER_BYTES + ENVELOPE_TAG_BYTES;

export const KEY_MODE_WORKSPACE = 0;
export const KEY_MODE_PASSPHRASE = 1;

export type KeyMode = typeof KEY_MODE_WORKSPACE | typeof KEY_MODE_PASSPHRASE;

export class EnvelopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvelopeError';
  }
}

export class EnvelopeKeyError extends EnvelopeError {
  constructor() {
    super('The content cannot be read with this key.');
    this.name = 'EnvelopeKeyError';
  }
}

export function getEnvelopeOverhead(): number {
  return ENVELOPE_OVERHEAD_BYTES;
}

async function resolveKey(
  keyMode: number,
  salt: Uint8Array,
  passphrase: string | null,
): Promise<CryptoKey> {
  if (keyMode === KEY_MODE_PASSPHRASE) {
    if (!passphrase) {
      throw new EnvelopeKeyError();
    }
    return derivePassphraseKey(passphrase, salt);
  }

  return deriveEnvelopeKey(salt);
}

async function encryptWith(
  plaintext: Uint8Array,
  keyMode: KeyMode,
  passphrase: string | null,
): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(ENVELOPE_SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(ENVELOPE_IV_BYTES));
  const key = await resolveKey(keyMode, salt, passphrase);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as BufferSource, tagLength: ENVELOPE_TAG_BYTES * 8 },
    key,
    plaintext as BufferSource,
  );

  const envelope = new Uint8Array(ENVELOPE_HEADER_BYTES + ciphertext.byteLength);
  envelope[0] = ENVELOPE_FORMAT_VERSION;
  envelope[1] = keyMode;
  envelope.set(salt, 2);
  envelope.set(iv, 2 + ENVELOPE_SALT_BYTES);
  envelope.set(new Uint8Array(ciphertext), ENVELOPE_HEADER_BYTES);

  return envelope;
}

async function decryptRange(
  envelope: Uint8Array,
  headerOffset: number,
  keyMode: number,
  passphrase: string | null,
): Promise<Uint8Array> {
  const saltStart = headerOffset;
  const ivStart = saltStart + ENVELOPE_SALT_BYTES;
  const bodyStart = ivStart + ENVELOPE_IV_BYTES;

  if (envelope.length <= bodyStart) {
    throw new EnvelopeError('There is no readable hidden content here.');
  }

  const salt = envelope.subarray(saltStart, ivStart);
  const iv = envelope.subarray(ivStart, bodyStart);
  const ciphertext = envelope.subarray(bodyStart);
  const key = await resolveKey(keyMode, salt, passphrase);

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as BufferSource, tagLength: ENVELOPE_TAG_BYTES * 8 },
      key,
      ciphertext as BufferSource,
    );

    return new Uint8Array(plaintext);
  } catch {
    throw new EnvelopeKeyError();
  }
}

export interface SealOptions {
  passphrase?: string | null;
}

export async function sealEnvelope(
  plaintext: Uint8Array,
  options: SealOptions = {},
): Promise<Uint8Array> {
  const passphrase = options.passphrase?.trim() ? options.passphrase.trim() : null;
  const keyMode: KeyMode = passphrase ? KEY_MODE_PASSPHRASE : KEY_MODE_WORKSPACE;

  return encryptWith(plaintext, keyMode, passphrase);
}

export interface OpenOptions {
  passphrase?: string | null;
}

export async function openEnvelope(
  envelope: Uint8Array,
  options: OpenOptions = {},
): Promise<Uint8Array> {
  const passphrase = options.passphrase?.trim() ? options.passphrase.trim() : null;
  const legacyOverheadBytes = ENVELOPE_SALT_BYTES + ENVELOPE_IV_BYTES + ENVELOPE_TAG_BYTES;

  if (envelope.length <= legacyOverheadBytes) {
    throw new EnvelopeError('There is no readable hidden content here.');
  }

  if (envelope[0] === ENVELOPE_FORMAT_VERSION) {
    try {
      return await decryptRange(envelope, 2, envelope[1], passphrase);
    } catch (error) {
      if (!(error instanceof EnvelopeKeyError)) {
        throw error;
      }

      try {
        return await decryptRange(envelope, 0, KEY_MODE_WORKSPACE, null);
      } catch {
        throw error;
      }
    }
  }

  return decryptRange(envelope, 0, KEY_MODE_WORKSPACE, null);
}
