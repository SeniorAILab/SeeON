import { randomBytes } from 'node:crypto';
import { decryptToken, encryptToken } from './token-crypto';

const ORIGINAL_KEY = process.env.KAKAO_TOKEN_ENC_KEY;

function setValidKey(): string {
  const key = randomBytes(32).toString('base64');
  process.env.KAKAO_TOKEN_ENC_KEY = key;
  return key;
}

describe('token-crypto', () => {
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.KAKAO_TOKEN_ENC_KEY;
    else process.env.KAKAO_TOKEN_ENC_KEY = ORIGINAL_KEY;
  });

  it('round-trips encrypted tokens', () => {
    setValidKey();

    const encrypted = encryptToken('kakao-access-token');

    expect(decryptToken(encrypted)).toBe('kakao-access-token');
  });

  it('throws when the encryption key is missing', () => {
    delete process.env.KAKAO_TOKEN_ENC_KEY;

    expect(() => encryptToken('kakao-access-token')).toThrow(
      'KAKAO_TOKEN_ENC_KEY is required',
    );
    expect(() => decryptToken('v1:iv:tag:ciphertext')).toThrow(
      'KAKAO_TOKEN_ENC_KEY is required',
    );
  });

  it('throws when the auth tag is tampered with', () => {
    setValidKey();
    const encrypted = encryptToken('kakao-access-token');
    const parts = encrypted.split(':');
    parts[2] = randomBytes(16).toString('base64url');

    expect(() => decryptToken(parts.join(':'))).toThrow();
  });

  it('throws when the ciphertext is tampered with', () => {
    setValidKey();
    const encrypted = encryptToken('kakao-access-token');
    const parts = encrypted.split(':');
    parts[3] = randomBytes(Math.max(1, parts[3].length)).toString('base64url');

    expect(() => decryptToken(parts.join(':'))).toThrow();
  });

  it('throws when the key does not decode to 32 bytes', () => {
    process.env.KAKAO_TOKEN_ENC_KEY = randomBytes(31).toString('base64');

    expect(() => encryptToken('kakao-access-token')).toThrow(
      'KAKAO_TOKEN_ENC_KEY must decode to exactly 32 bytes',
    );
  });

  it('uses a fresh iv so encrypting the same plaintext differs', () => {
    setValidKey();

    const first = encryptToken('kakao-access-token');
    const second = encryptToken('kakao-access-token');

    expect(first).not.toBe(second);
    expect(first.split(':')[1]).not.toBe(second.split(':')[1]);
    expect(decryptToken(first)).toBe('kakao-access-token');
    expect(decryptToken(second)).toBe('kakao-access-token');
  });

  it('accepts a 32-byte hex key', () => {
    process.env.KAKAO_TOKEN_ENC_KEY = randomBytes(32).toString('hex');

    const encrypted = encryptToken('kakao-access-token');

    expect(decryptToken(encrypted)).toBe('kakao-access-token');
  });
});
