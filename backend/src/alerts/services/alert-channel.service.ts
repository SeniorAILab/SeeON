import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  AlertChannelDispatchResultDto,
  AlertWebhookPayloadDto,
  AlertWebhookStatusDto,
} from '../dto/alert-events.dto';
import { KakaoSenderService } from './kakao-sender.service';

const WEBHOOK_TIMEOUT_MS = 3_000;

@Injectable()
export class AlertChannelService {
  constructor(
    private readonly configService: ConfigService,
    private readonly kakaoSenderService: KakaoSenderService,
  ) {}

  async dispatch(
    payload: AlertWebhookPayloadDto,
  ): Promise<AlertChannelDispatchResultDto> {
    const channel = this.configService.get<string>('ALERT_CHANNEL');
    if (channel === 'kakao') {
      return this.dispatchKakaoWithFallback(payload);
    }

    if (channel === 'webhook') {
      const webhookStatus = await this.dispatchWebhook(payload);
      return {
        channel_status: channelStatusForWebhook(webhookStatus),
        webhook_status: webhookStatus,
      };
    }

    return {
      channel_status: 'webhook_disabled',
      webhook_status: 'disabled',
      kakao_status: 'disabled',
    };
  }

  private async dispatchKakaoWithFallback(
    payload: AlertWebhookPayloadDto,
  ): Promise<AlertChannelDispatchResultDto> {
    try {
      await this.kakaoSenderService.send(payload);
      return {
        channel_status: 'kakao_sent',
        kakao_status: 'sent',
        webhook_status: 'disabled',
      };
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      if (!this.hasWebhookFallback()) {
        return {
          channel_status: 'kakao_failed',
          kakao_status: 'failed',
          webhook_status: 'disabled',
        };
      }

      const webhookStatus = await this.dispatchWebhook(payload);
      return {
        channel_status: 'kakao_failed_webhook_fallback',
        kakao_status: 'failed',
        webhook_status: webhookStatus,
      };
    }
  }

  private hasWebhookFallback(): boolean {
    const webhookUrl = this.configService.get<string>('ALERT_WEBHOOK_URL');
    return webhookUrl !== undefined && webhookUrl.length > 0;
  }

  private async dispatchWebhook(
    payload: AlertWebhookPayloadDto,
  ): Promise<AlertWebhookStatusDto> {
    const webhookUrl = this.configService.get<string>('ALERT_WEBHOOK_URL');
    if (webhookUrl === undefined || webhookUrl.length === 0) {
      return 'failed';
    }

    try {
      return await postJsonWebhook(new URL(webhookUrl), payload);
    } catch (error) {
      if (error instanceof WebhookTimeoutError) {
        return 'timeout';
      }
      if (error instanceof Error) {
        return 'failed';
      }
      throw error;
    }
  }
}

function channelStatusForWebhook(
  webhookStatus: AlertWebhookStatusDto,
): AlertChannelDispatchResultDto['channel_status'] {
  if (typeof webhookStatus === 'number') {
    return 'webhook_sent';
  }
  if (webhookStatus === 'timeout') {
    return 'webhook_timeout';
  }
  if (webhookStatus === 'disabled') {
    return 'webhook_disabled';
  }
  return 'webhook_failed';
}

class WebhookTimeoutError extends Error {
  constructor() {
    super('Alert webhook request timed out');
  }
}

async function postJsonWebhook(
  url: URL,
  payload: AlertWebhookPayloadDto,
): Promise<number> {
  const body = JSON.stringify(payload);
  return new Promise<number>((resolve, reject) => {
    const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = request(
      url,
      {
        method: 'POST',
        timeout: WEBHOOK_TIMEOUT_MS,
        headers: {
          Accept: 'application/json',
          'Content-Length': Buffer.byteLength(body),
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode ?? 0));
      },
    );
    req.on('timeout', () => req.destroy(new WebhookTimeoutError()));
    req.on('error', reject);
    req.end(body);
  });
}
