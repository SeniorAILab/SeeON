import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const TOKEN_CIPHER_VERSION = 'v1';
const TOKEN_ALGORITHM = 'aes-256-gcm';
const TOKEN_KEY_BYTES = 32;
const TOKEN_IV_BYTES = 12;
const TOKEN_TAG_BYTES = 16;

/**
 * Encrypted token wire format:
 * v1:<base64url(iv)>:<base64url(authTag)>:<base64url(ciphertext)>
 */
export function encryptToken(plaintext: string): string {
  const key = getTokenEncryptionKey();
  const iv = randomBytes(TOKEN_IV_BYTES);
  const cipher = createCipheriv(TOKEN_ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    TOKEN_CIPHER_VERSION,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':');
}

export function decryptToken(payload: string): string {
  const key = getTokenEncryptionKey();
  const parts = payload.split(':');
  if (parts.length !== 4 || parts[0] !== TOKEN_CIPHER_VERSION) {
    throw new Error('Unsupported encrypted token format');
  }

  const iv = decodeBase64Url(parts[1], 'encrypted token iv');
  const authTag = decodeBase64Url(parts[2], 'encrypted token auth tag');
  const ciphertext = decodeBase64Url(parts[3], 'encrypted token ciphertext');
  if (iv.length !== TOKEN_IV_BYTES) {
    throw new Error('Invalid encrypted token iv');
  }
  if (authTag.length !== TOKEN_TAG_BYTES) {
    throw new Error('Invalid encrypted token auth tag');
  }

  const decipher = createDecipheriv(TOKEN_ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString('utf8');
}

function getTokenEncryptionKey(): Buffer {
  const encodedKey = process.env.KAKAO_TOKEN_ENC_KEY;
  if (!encodedKey) throw new Error('KAKAO_TOKEN_ENC_KEY is required');

  const key = decodeKey(encodedKey);
  if (key.length !== TOKEN_KEY_BYTES) {
    throw new Error('KAKAO_TOKEN_ENC_KEY must decode to exactly 32 bytes');
  }
  return key;
}

function decodeKey(encodedKey: string): Buffer {
  const trimmed = encodedKey.trim();
  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length % 2 === 0) {
    return Buffer.from(trimmed, 'hex');
  }
  return Buffer.from(trimmed, 'base64');
}

function decodeBase64Url(value: string, label: string): Buffer {
  try {
    return Buffer.from(value, 'base64url');
  } catch {
    throw new Error(`Invalid ${label}`);
  }
}
