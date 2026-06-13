export const AlertEventTypes = {
  detectionLost: 'detection-lost',
  fall: 'fall',
} as const;

export type AlertEventType =
  (typeof AlertEventTypes)[keyof typeof AlertEventTypes];

export type AlertEventIngressDto = {
  readonly type: AlertEventType;
  readonly source_id: string;
  readonly detected_at: string;
  readonly confidence?: number;
};

export type AlertEventResponseDto = {
  readonly event_id: string;
};

export type AlertWebhookPayloadDto = AlertEventIngressDto & {
  readonly event_id: string;
  readonly received_at: string;
  readonly forwarded_at: string;
};

export type AlertWebhookStatusDto = number | 'disabled' | 'failed' | 'timeout';

export type AlertKakaoStatusDto = 'sent' | 'failed' | 'disabled';

export type AlertChannelStatusDto =
  | 'webhook_sent'
  | 'webhook_failed'
  | 'webhook_timeout'
  | 'webhook_disabled'
  | 'kakao_sent'
  | 'kakao_failed'
  | 'kakao_failed_webhook_fallback';

export type AlertChannelDispatchResultDto = {
  readonly channel_status: AlertChannelStatusDto;
  readonly webhook_status: AlertWebhookStatusDto;
  readonly kakao_status?: AlertKakaoStatusDto;
};

export type AlertAuditRecordDto =
  | (AlertWebhookPayloadDto & {
      readonly webhook_status: AlertWebhookStatusDto;
      readonly channel_status?: AlertChannelStatusDto;
      readonly kakao_status?: AlertKakaoStatusDto;
    })
  | (AlertEventIngressDto & {
      readonly event_id: string;
      readonly received_at: string;
      readonly suppressed_reason: 'cooldown' | 'hourly_cap';
    });
