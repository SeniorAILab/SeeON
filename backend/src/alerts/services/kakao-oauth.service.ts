import { request } from 'node:https';
import { Injectable } from '@nestjs/common';

import type {
  BuildKakaoAuthorizeUrlDto,
  ExchangeKakaoAuthorizationCodeDto,
  KakaoRefreshTokenResponseDto,
  KakaoTokenFileDto,
  KakaoTokenResponseDto,
  RedactedKakaoTokenSummaryDto,
} from '../dto/kakao-oauth.dto';

export class KakaoTokenParseError extends Error {
  constructor(readonly field: string) {
    super(`Invalid Kakao token response field: ${field}`);
  }
}

export class KakaoHttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly responseBody: string,
  ) {
    super(`Kakao token request failed with HTTP ${statusCode}`);
  }
}

export class KakaoRequestTimeoutError extends Error {
  constructor() {
    super('Kakao token request timed out');
  }
}

@Injectable()
export class KakaoOAuthService {
  buildAuthorizeUrl(dto: BuildKakaoAuthorizeUrlDto): string {
    const url = new URL('https://kauth.kakao.com/oauth/authorize');
    url.searchParams.append('client_id', dto.oauth.restApiKey);
    url.searchParams.append('redirect_uri', dto.oauth.redirectUri);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('scope', 'talk_message');
    if (dto.state !== undefined && dto.state.length > 0) {
      url.searchParams.append('state', dto.state);
    }
    return url.toString();
  }

  parseKakaoTokenResponse(input: unknown, now: Date): KakaoTokenFileDto {
    const response = this.parseKakaoTokenResponseDto(input);

    return {
      access_token: response.access_token,
      refresh_token: response.refresh_token,
      expires_at: toIsoAfterSeconds(now, response.expires_in),
      refresh_expires_at: toIsoAfterSeconds(
        now,
        response.refresh_token_expires_in,
      ),
    };
  }

  parseKakaoTokenResponseDto(input: unknown): KakaoTokenResponseDto {
    const body = parseObject(input);
    return {
      access_token: readString(body, 'access_token'),
      refresh_token: readString(body, 'refresh_token'),
      expires_in: readPositiveSeconds(body, 'expires_in'),
      refresh_token_expires_in: readPositiveSeconds(
        body,
        'refresh_token_expires_in',
      ),
    };
  }

  parseKakaoRefreshTokenResponse(
    current: KakaoTokenFileDto,
    input: unknown,
    now: Date,
  ): KakaoTokenFileDto {
    const response = this.parseKakaoRefreshTokenResponseDto(input);
    return {
      access_token: response.access_token,
      refresh_token: response.refresh_token ?? current.refresh_token,
      expires_at: toIsoAfterSeconds(now, response.expires_in),
      refresh_expires_at:
        response.refresh_token_expires_in === undefined
          ? current.refresh_expires_at
          : toIsoAfterSeconds(now, response.refresh_token_expires_in),
    };
  }

  parseKakaoRefreshTokenResponseDto(
    input: unknown,
  ): KakaoRefreshTokenResponseDto {
    const body = parseObject(input);
    return {
      access_token: readString(body, 'access_token'),
      expires_in: readPositiveSeconds(body, 'expires_in'),
      refresh_token: readOptionalString(body, 'refresh_token'),
      refresh_token_expires_in: readOptionalPositiveSeconds(
        body,
        'refresh_token_expires_in',
      ),
    };
  }

  redactedTokenSummary(token: KakaoTokenFileDto): RedactedKakaoTokenSummaryDto {
    return {
      access_token_present: token.access_token.length > 0,
      refresh_token_present: token.refresh_token.length > 0,
      expires_at: token.expires_at,
      refresh_expires_at: token.refresh_expires_at,
    };
  }

  async exchangeAuthorizationCode(
    dto: ExchangeKakaoAuthorizationCodeDto,
  ): Promise<KakaoTokenFileDto> {
    const response = await postForm(
      new URL('https://kauth.kakao.com/oauth/token'),
      new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: dto.oauth.restApiKey,
        redirect_uri: dto.oauth.redirectUri,
        code: dto.code,
      }),
    );
    return this.parseKakaoTokenResponse(response, new Date());
  }
}

function parseObject(input: unknown): object {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new KakaoTokenParseError('body');
  }
  return input;
}

function readString(body: object, field: string): string {
  const value: unknown = Reflect.get(body, field);
  if (typeof value !== 'string' || value.length === 0) {
    throw new KakaoTokenParseError(field);
  }
  return value;
}

function readOptionalString(body: object, field: string): string | undefined {
  const value: unknown = Reflect.get(body, field);
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new KakaoTokenParseError(field);
  }
  return value;
}

function readPositiveSeconds(body: object, field: string): number {
  const value: unknown = Reflect.get(body, field);
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new KakaoTokenParseError(field);
  }
  return value;
}

function readOptionalPositiveSeconds(
  body: object,
  field: string,
): number | undefined {
  const value: unknown = Reflect.get(body, field);
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new KakaoTokenParseError(field);
  }
  return value;
}

function toIsoAfterSeconds(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1000).toISOString();
}

async function postForm(url: URL, form: URLSearchParams): Promise<unknown> {
  const responseBody = await new Promise<string>((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'POST',
        timeout: 10_000,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const statusCode = res.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            reject(new KakaoHttpError(statusCode, body));
            return;
          }
          resolve(body);
        });
      },
    );
    req.on('timeout', () => req.destroy(new KakaoRequestTimeoutError()));
    req.on('error', reject);
    req.end(form.toString());
  });

  try {
    const parsed: unknown = JSON.parse(responseBody);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new KakaoTokenParseError('json');
    }
    throw error;
  }
}
