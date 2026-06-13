import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { dirname, join } from 'node:path';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { AlertWebhookPayloadDto } from '../dto/alert-events.dto';
import type {
  KakaoTokenFileDto,
  RedactedKakaoTokenSummaryDto,
} from '../dto/kakao-oauth.dto';
import { KakaoOAuthService } from './kakao-oauth.service';

const DEFAULT_KAKAO_MESSAGE_ENDPOINT =
  'https://kapi.kakao.com/v2/api/talk/memo/default/send';
const DEFAULT_KAKAO_TOKEN_ENDPOINT = 'https://kauth.kakao.com/oauth/token';
const DEFAULT_TOKEN_PATH = join(process.cwd(), 'var', 'kakao-token.json');
const DEFAULT_LINK_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 3_000;
const REFRESH_SKEW_MS = 5 * 60 * 1_000;

export type KakaoSendResultDto = { readonly status: 'sent' };

export type KakaoSendOptionsDto = {
  readonly now?: Date;
};

@Injectable()
export class KakaoSenderService {
  private refreshQueue: Promise<KakaoTokenFileDto> | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly kakaoOAuthService: KakaoOAuthService,
  ) {}

  async send(
    payload: AlertWebhookPayloadDto,
    options: KakaoSendOptionsDto = {},
  ): Promise<KakaoSendResultDto> {
    const now = options.now ?? new Date();
    const token = await this.ensureUsableToken(now);
    await this.postSendToMe(token.access_token, payload);
    return { status: 'sent' };
  }

  redactedTokenMetadata(
    token: KakaoTokenFileDto,
  ): RedactedKakaoTokenSummaryDto {
    return this.kakaoOAuthService.redactedTokenSummary(token);
  }

  private async ensureUsableToken(now: Date): Promise<KakaoTokenFileDto> {
    const token = await this.readTokenFile();
    if (!isExpiring(token.expires_at, now)) {
      return token;
    }

    if (this.refreshQueue === undefined) {
      this.refreshQueue = this.refreshToken(token, now).finally(() => {
        this.refreshQueue = undefined;
      });
    }

    return this.refreshQueue;
  }

  private async refreshToken(
    current: KakaoTokenFileDto,
    now: Date,
  ): Promise<KakaoTokenFileDto> {
    const restApiKey = this.readRequiredConfig('KAKAO_REST_API_KEY');
    const form = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: restApiKey,
      refresh_token: current.refresh_token,
    });
    const clientSecret = this.configService.get<string>('KAKAO_CLIENT_SECRET');
    if (clientSecret !== undefined && clientSecret.length > 0) {
      form.append('client_secret', clientSecret);
    }

    const response = await postForm(this.tokenEndpoint(), form, {
      timeoutMs: this.timeoutMs(),
    });
    const refreshed = this.kakaoOAuthService.parseKakaoRefreshTokenResponse(
      current,
      response,
      now,
    );
    await this.writeTokenFile(refreshed);
    return refreshed;
  }

  private async postSendToMe(
    accessToken: string,
    payload: AlertWebhookPayloadDto,
  ): Promise<void> {
    const form = new URLSearchParams({
      template_object: JSON.stringify(this.buildTemplate(payload)),
    });
    await postForm(this.messageEndpoint(), form, {
      authorizationBearer: accessToken,
      timeoutMs: this.timeoutMs(),
    });
  }

  private buildTemplate(
    payload: AlertWebhookPayloadDto,
  ): Record<string, unknown> {
    const confidence =
      payload.confidence === undefined
        ? ''
        : ` confidence=${payload.confidence.toFixed(2)}`;
    return {
      object_type: 'text',
      text:
        `Fall alert: ${payload.type} source=${payload.source_id}` +
        ` detected_at=${payload.detected_at}${confidence}`,
      link: {
        web_url: this.messageLinkUrl(),
        mobile_web_url: this.messageLinkUrl(),
      },
    };
  }

  private async readTokenFile(): Promise<KakaoTokenFileDto> {
    try {
      return parseTokenFile(await readFile(this.tokenPath(), 'utf8'));
    } catch (error) {
      if (error instanceof KakaoTokenFileParseError) {
        throw error;
      }
      if (error instanceof SyntaxError) {
        throw new KakaoTokenFileParseError('json');
      }
      throw error;
    }
  }

  private async writeTokenFile(token: KakaoTokenFileDto): Promise<void> {
    const tokenPath = this.tokenPath();
    await mkdir(dirname(tokenPath), { recursive: true });
    const tmpPath = `${tokenPath}.${randomUUID()}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(token, null, 2)}\n`, {
      mode: 0o600,
    });
    await rename(tmpPath, tokenPath);
  }

  private readRequiredConfig(name: string): string {
    const value = this.configService.get<string>(name);
    if (value === undefined || value.length === 0) {
      throw new KakaoConfigError(name);
    }
    return value;
  }

  private tokenPath(): string {
    return (
      this.configService.get<string>('KAKAO_TOKEN_PATH') ?? DEFAULT_TOKEN_PATH
    );
  }

  private messageEndpoint(): URL {
    return new URL(
      this.configService.get<string>('KAKAO_MESSAGE_ENDPOINT') ??
        DEFAULT_KAKAO_MESSAGE_ENDPOINT,
    );
  }

  private tokenEndpoint(): URL {
    return new URL(
      this.configService.get<string>('KAKAO_TOKEN_ENDPOINT') ??
        DEFAULT_KAKAO_TOKEN_ENDPOINT,
    );
  }

  private messageLinkUrl(): string {
    return (
      this.configService.get<string>('KAKAO_MESSAGE_LINK_URL') ??
      this.configService.get<string>('ALERT_DASHBOARD_URL') ??
      DEFAULT_LINK_URL
    );
  }

  private timeoutMs(): number {
    const configured = this.configService.get<string | number>(
      'KAKAO_REQUEST_TIMEOUT_MS',
    );
    if (typeof configured === 'number' && configured > 0) {
      return Math.trunc(configured);
    }
    if (typeof configured === 'string') {
      const parsed = Number(configured);
      if (Number.isFinite(parsed) && parsed > 0) {
        return Math.trunc(parsed);
      }
    }
    return DEFAULT_TIMEOUT_MS;
  }
}

export class KakaoTokenFileParseError extends Error {
  constructor(readonly field: string) {
    super(`Invalid Kakao token file field: ${field}`);
  }
}

export class KakaoConfigError extends Error {
  constructor(readonly configName: string) {
    super(`Kakao config is missing: ${configName}`);
  }
}

export class KakaoSendHttpError extends Error {
  constructor(readonly statusCode: number) {
    super(`Kakao send request failed with HTTP ${statusCode}`);
  }
}

export class KakaoSendTimeoutError extends Error {
  constructor() {
    super('Kakao send request timed out');
  }
}

function parseTokenFile(input: string): KakaoTokenFileDto {
  try {
    const parsed: unknown = JSON.parse(input);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new KakaoTokenFileParseError('body');
    }
    return {
      access_token: readTokenString(parsed, 'access_token'),
      refresh_token: readTokenString(parsed, 'refresh_token'),
      expires_at: readTokenIsoDate(parsed, 'expires_at'),
      refresh_expires_at: readTokenIsoDate(parsed, 'refresh_expires_at'),
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new KakaoTokenFileParseError('json');
    }
    throw error;
  }
}

function readTokenString(body: object, field: string): string {
  const value: unknown = Reflect.get(body, field);
  if (typeof value !== 'string' || value.length === 0) {
    throw new KakaoTokenFileParseError(field);
  }
  return value;
}

function readTokenIsoDate(body: object, field: string): string {
  const value = readTokenString(body, field);
  if (Number.isNaN(Date.parse(value))) {
    throw new KakaoTokenFileParseError(field);
  }
  return value;
}

function isExpiring(expiresAt: string, now: Date): boolean {
  return Date.parse(expiresAt) - now.getTime() <= REFRESH_SKEW_MS;
}

async function postForm(
  url: URL,
  form: URLSearchParams,
  options: {
    readonly authorizationBearer?: string;
    readonly timeoutMs: number;
  },
): Promise<unknown> {
  const responseBody = await new Promise<string>((resolve, reject) => {
    const body = form.toString();
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const headers: Record<string, string | number> = {
      Accept: 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
    };
    if (
      options.authorizationBearer !== undefined &&
      options.authorizationBearer.length > 0
    ) {
      headers.Authorization = `Bearer ${options.authorizationBearer}`;
    }

    const req = request(
      url,
      {
        method: 'POST',
        timeout: options.timeoutMs,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const response = Buffer.concat(chunks).toString('utf8');
          const statusCode = res.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            reject(new KakaoSendHttpError(statusCode));
            return;
          }
          resolve(response);
        });
      },
    );
    req.on('timeout', () => req.destroy(new KakaoSendTimeoutError()));
    req.on('error', reject);
    req.end(body);
  });

  if (responseBody.length === 0) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(responseBody);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new KakaoTokenFileParseError('response-json');
    }
    throw error;
  }
}
