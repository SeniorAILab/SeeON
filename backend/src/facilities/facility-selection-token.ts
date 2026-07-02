import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const TOKEN_VERSION = 'v1';
const IV_BYTES = 12;

export type FacilitySelectionTokenPayload = {
  readonly facilityId: string;
  readonly sessionId: string;
  readonly exp: number;
};

export function createFacilitySelectionToken(
  payload: Omit<FacilitySelectionTokenPayload, 'exp'> & {
    readonly expiresAtSeconds: number;
  },
  secret: string,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv);
  cipher.setAAD(Buffer.from(TOKEN_VERSION));
  const plaintext = Buffer.from(
    JSON.stringify({
      facilityId: payload.facilityId,
      sessionId: payload.sessionId,
      exp: payload.expiresAtSeconds,
    }),
    'utf8',
  );
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [TOKEN_VERSION, encode(iv), encode(encrypted), encode(tag)].join('.');
}

export function readFacilitySelectionToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): FacilitySelectionTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return null;
  try {
    const [, ivRaw, encryptedRaw, tagRaw] = parts;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyFromSecret(secret),
      decode(ivRaw),
    );
    decipher.setAAD(Buffer.from(TOKEN_VERSION));
    decipher.setAuthTag(decode(tagRaw));
    const plaintext = Buffer.concat([
      decipher.update(decode(encryptedRaw)),
      decipher.final(),
    ]).toString('utf8');
    const parsed = parsePayload(JSON.parse(plaintext));
    if (parsed === null || parsed.exp < nowSeconds) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parsePayload(value: unknown): FacilitySelectionTokenPayload | null {
  if (!isRecord(value)) return null;
  const { facilityId, sessionId, exp } = value;
  if (
    typeof facilityId !== 'string' ||
    typeof sessionId !== 'string' ||
    typeof exp !== 'number' ||
    !Number.isFinite(exp)
  ) {
    return null;
  }
  return { facilityId, sessionId, exp };
}

function keyFromSecret(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function encode(value: Buffer): string {
  return value.toString('base64url');
}

function decode(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
