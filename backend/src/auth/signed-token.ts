import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SessionTokenPayload {
  sessionId: string;
  userId: string;
  facilityId: string | null;
  sessionVersion: number;
  iat: number;
  exp: number;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(content: string, secret: string): string {
  return createHmac('sha256', secret).update(content).digest('base64url');
}

export function createSignedSessionToken(
  payload: SessionTokenPayload,
  secret: string,
): string {
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64Url(JSON.stringify(payload));
  const content = `${header}.${body}`;
  return `${content}.${sign(content, secret)}`;
}

export function verifySignedSessionToken(
  token: string,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): SessionTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [header, body, signature] = parts;
  const expected = sign(`${header}.${body}`, secret);
  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (
    expectedBuffer.length !== actualBuffer.length ||
    !timingSafeEqual(expectedBuffer, actualBuffer)
  )
    return null;

  let parsed: Partial<SessionTokenPayload>;
  try {
    parsed = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8'),
    ) as Partial<SessionTokenPayload>;
  } catch {
    return null;
  }
  if (
    typeof parsed.sessionId !== 'string' ||
    typeof parsed.userId !== 'string' ||
    typeof parsed.sessionVersion !== 'number' ||
    typeof parsed.iat !== 'number' ||
    typeof parsed.exp !== 'number' ||
    !(typeof parsed.facilityId === 'string' || parsed.facilityId === null)
  ) {
    return null;
  }
  if (parsed.exp <= nowSeconds) return null;
  return parsed as SessionTokenPayload;
}
