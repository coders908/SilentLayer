
const DEVELOPMENT_FALLBACK_SECRET = 'silentlayer-default-workspace-key-change-me';
const KEY_DERIVATION_PURPOSE = 'silentlayer/v5/envelope';
const SCATTER_DERIVATION_PURPOSE = 'silentlayer/v5/carrier-scatter';

export const PASSPHRASE_ITERATIONS = 310_000;

export const MIN_PASSPHRASE_LENGTH = 8;

let cachedWorkspaceSecret: string | null = null;

export function getWorkspaceSecret(): string {
  if (cachedWorkspaceSecret === null) {
    const configuredSecret = import.meta.env?.VITE_SILENTLAYER_WORKSPACE_KEY;
    cachedWorkspaceSecret =
      typeof configuredSecret === 'string' && configuredSecret.trim().length > 0
        ? configuredSecret.trim()
        : DEVELOPMENT_FALLBACK_SECRET;
  }

  return cachedWorkspaceSecret;
}

export function isUsingDevelopmentKey(): boolean {
  return getWorkspaceSecret() === DEVELOPMENT_FALLBACK_SECRET;
}

export function isValidPassphrase(passphrase: string): boolean {
  return passphrase.trim().length >= MIN_PASSPHRASE_LENGTH;
}

export async function derivePassphraseKey(
  passphrase: string,
  salt: Uint8Array,
): Promise<CryptoKey> {
  const passphraseBytes = new TextEncoder().encode(passphrase);
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passphraseBytes,
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      iterations: PASSPHRASE_ITERATIONS,
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

async function importWorkspaceKeyMaterial(): Promise<CryptoKey> {
  const secretBytes = new TextEncoder().encode(getWorkspaceSecret());

  return crypto.subtle.importKey('raw', secretBytes, 'HKDF', false, ['deriveKey', 'deriveBits']);
}

export async function deriveEnvelopeKey(salt: Uint8Array): Promise<CryptoKey> {
  const keyMaterial = await importWorkspaceKeyMaterial();

  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as BufferSource,
      info: new TextEncoder().encode(KEY_DERIVATION_PURPOSE),
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function deriveScatterSeed(): Promise<number> {
  const keyMaterial = await importWorkspaceKeyMaterial();

  const seedBytes = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(SCATTER_DERIVATION_PURPOSE),
    },
    keyMaterial,
    32,
  );

  return new DataView(seedBytes).getUint32(0, false);
}
