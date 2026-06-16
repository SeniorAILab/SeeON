import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readPositiveIntegerConfig } from './config.js';

import type {
  AlertDeliveryMessage,
  ChannelPort,
  DeliveryFailureClass,
  DeliveryResult,
} from '../ports/channel.port.js';

const DEFAULT_KAKAO_MESSAGE_ENDPOINT =
  'https://kapi.kakao.com/v2/api/talk/memo/default/send';
const DEFAULT_LINK_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT_MS = 3_000;

@Injectable()
export class KakaoSendToMeChannelAdapter implements ChannelPort {
  constructor(private readonly configService: ConfigService) {}

  async send(message: AlertDeliveryMessage): Promise<DeliveryResult> {
    try {
      const token = await this.readAccessToken();
      await postSendToMe(
        this.messageEndpoint(),
        token,
        this.buildTemplate(message),
        {
          timeoutMs: this.timeoutMs(),
        },
      );
      return {
        kind: 'sent',
        provider_reference: 'kakao-send-to-me',
      };
    } catch (error) {
      return classifyKakaoDeliveryFailure(error);
    }
  }

  private async readAccessToken(): Promise<string> {
    const tokenPath = this.configService.get<string>('KAKAO_TOKEN_PATH');
    if (tokenPath === undefined || tokenPath.length === 0) {
      throw new KakaoConfigError('KAKAO_TOKEN_PATH');
    }

    try {
      const parsed: unknown = JSON.parse(await readFile(tokenPath, 'utf8'));
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new KakaoTokenFileError('body');
      }
      const accessToken: unknown = Reflect.get(parsed, 'access_token');
      if (typeof accessToken !== 'string' || accessToken.length === 0) {
        throw new KakaoTokenFileError('access_token');
      }
      return accessToken;
    } catch (error) {
      if (
        error instanceof KakaoTokenFileError ||
        error instanceof SyntaxError
      ) {
        throw new KakaoTokenFileError('json');
      }
      throw new KakaoTokenFileError('read');
    }
  }

  private buildTemplate(
    message: AlertDeliveryMessage,
  ): Record<string, unknown> {
    const confidence =
      message.confidence === undefined
        ? ''
        : ` confidence=${message.confidence.toFixed(2)}`;
    return {
      object_type: 'text',
      text:
        `Fall alert: ${message.type} source=${message.source_id}` +
        ` external_event_id=${message.external_event_id}` +
        ` detected_at=${message.detected_at}${confidence}`,
      link: {
        web_url: this.messageLinkUrl(),
        mobile_web_url: this.messageLinkUrl(),
      },
    };
  }

  private messageEndpoint(): URL {
    return new URL(
      this.configService.get<string>('KAKAO_MESSAGE_ENDPOINT') ??
        DEFAULT_KAKAO_MESSAGE_ENDPOINT,
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
    return readPositiveIntegerConfig(
      this.configService,
      'KAKAO_REQUEST_TIMEOUT_MS',
      DEFAULT_TIMEOUT_MS,
    );
  }
}

export class KakaoConfigError extends Error {
  constructor(readonly configName: string) {
    super(`Kakao config is missing: ${configName}`);
  }
}

export class KakaoTokenFileError extends Error {
  constructor(readonly field: string) {
    super(`Kakao token file is invalid: ${field}`);
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

export class KakaoSendNetworkError extends Error {
  constructor(readonly causeMessage: string) {
    super(`Kakao send request failed: ${causeMessage}`);
  }
}

export function classifyKakaoDeliveryFailure(error: unknown): DeliveryResult {
  if (error instanceof KakaoSendHttpError) {
    if (error.statusCode >= 500) {
      return failed('transient', `kakao_http_${error.statusCode}`, 60_000);
    }
    return failed(
      'terminal_operator_action',
      `kakao_http_${error.statusCode}`,
      undefined,
      'Inspect Kakao app/channel permissions, token scope, and request template.',
    );
  }

  if (
    error instanceof KakaoSendTimeoutError ||
    error instanceof KakaoSendNetworkError
  ) {
    return failed('transient', error.message, 60_000);
  }

  if (
    error instanceof KakaoConfigError ||
    error instanceof KakaoTokenFileError
  ) {
    return failed(
      'terminal_operator_action',
      error.message,
      undefined,
      'Provide a valid KAKAO_TOKEN_PATH token file before retrying delivery.',
    );
  }

  return failed('transient', 'unknown_kakao_send_error', 60_000);
}

function failed(
  failureClass: DeliveryFailureClass,
  reason: string,
  retryAfterMs?: number,
  operatorAction?: string,
): DeliveryResult {
  return {
    kind: 'failed',
    failure_class: failureClass,
    reason,
    retry_after_ms: retryAfterMs,
    operator_action: operatorAction,
  };
}

async function postSendToMe(
  url: URL,
  accessToken: string,
  template: Record<string, unknown>,
  options: { readonly timeoutMs: number },
): Promise<void> {
  const form = new URLSearchParams({
    template_object: JSON.stringify(template),
  });
  const body = form.toString();

  await new Promise<void>((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(
      url,
      {
        method: 'POST',
        timeout: options.timeoutMs,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
          'Content-Length': Buffer.byteLength(body),
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8',
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          const statusCode = res.statusCode ?? 0;
          if (statusCode < 200 || statusCode >= 300) {
            reject(new KakaoSendHttpError(statusCode));
            return;
          }
          resolve();
        });
      },
    );
    req.on('timeout', () => req.destroy(new KakaoSendTimeoutError()));
    req.on('error', (error: Error) => {
      if (error instanceof KakaoSendTimeoutError) {
        reject(error);
        return;
      }
      reject(new KakaoSendNetworkError(error.message));
    });
    req.end(body);
  });
}
