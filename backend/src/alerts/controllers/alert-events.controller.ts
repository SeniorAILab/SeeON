import { timingSafeEqual } from 'node:crypto';

import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Post,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  AlertEventIngressDto,
  AlertEventResponseDto,
} from '../dto/alert-events.dto';
import { AlertEventTypes } from '../dto/alert-events.dto';
import { AlertEventsService } from '../services/alert-events.service';

const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
const ALERT_EVENTS_API_KEY_HEADER = 'x-alert-api-key';

@Controller('api.alerts')
export class AlertEventsController {
  constructor(
    private readonly configService: ConfigService,
    private readonly alertEventsService: AlertEventsService,
  ) {}

  @Post('events')
  async createEvent(
    @Headers(ALERT_EVENTS_API_KEY_HEADER) apiKey: string | undefined,
    @Body() body: unknown,
  ): Promise<AlertEventResponseDto> {
    assertAuthorizedAlertEventIngress(this.configService, apiKey);
    return this.alertEventsService.ingest(parseAlertEventIngress(body));
  }
}

export function assertAuthorizedAlertEventIngress(
  configService: ConfigService,
  submittedApiKey: string | undefined,
): void {
  const configuredApiKey =
    configService.get<string>('ALERT_EVENTS_API_KEY')?.trim() ?? '';
  if (configuredApiKey.length === 0) {
    throw new UnauthorizedException({
      error: {
        code: 'ALERT_EVENT_AUTH_MISSING',
        message: 'Alert event API key is required.',
      },
    });
  }
  if (submittedApiKey === undefined) {
    throw new UnauthorizedException({
      error: {
        code: 'ALERT_EVENT_AUTH_MISSING',
        message: 'Alert event API key is required.',
      },
    });
  }
  if (!isMatchingApiKey(submittedApiKey, configuredApiKey)) {
    throw new ForbiddenException({
      error: {
        code: 'ALERT_EVENT_AUTH_INVALID',
        message: 'Alert event API key is invalid.',
      },
    });
  }
}

function isMatchingApiKey(
  submittedApiKey: string,
  configuredApiKey: string,
): boolean {
  const submitted = Buffer.from(submittedApiKey, 'utf8');
  const configured = Buffer.from(configuredApiKey, 'utf8');
  return (
    submitted.length === configured.length &&
    timingSafeEqual(submitted, configured)
  );
}

export function parseAlertEventIngress(body: unknown): AlertEventIngressDto {
  if (!isJsonRecord(body)) {
    throw new AlertEventPayloadError('body');
  }

  const type = body.type;
  const sourceId = body.source_id;
  const externalEventId = body.external_event_id;
  const detectedAt = body.detected_at;
  const confidence = body.confidence;

  if (type !== AlertEventTypes.fall && type !== AlertEventTypes.detectionLost) {
    throw new AlertEventPayloadError('type');
  }
  if (typeof sourceId !== 'string' || sourceId.length === 0) {
    throw new AlertEventPayloadError('source_id');
  }
  if (typeof externalEventId !== 'string' || externalEventId.length === 0) {
    throw new AlertEventPayloadError('external_event_id');
  }
  if (typeof detectedAt !== 'string' || !isValidTimestamp(detectedAt)) {
    throw new AlertEventPayloadError('detected_at');
  }
  if (
    confidence !== undefined &&
    (typeof confidence !== 'number' ||
      !Number.isFinite(confidence) ||
      confidence < 0 ||
      confidence > 1)
  ) {
    throw new AlertEventPayloadError('confidence');
  }

  if (confidence === undefined) {
    return {
      type,
      source_id: sourceId,
      external_event_id: externalEventId,
      detected_at: detectedAt,
    };
  }

  return {
    type,
    source_id: sourceId,
    external_event_id: externalEventId,
    detected_at: detectedAt,
    confidence,
  };
}

function isValidTimestamp(value: string): boolean {
  return ISO_TIMESTAMP_PATTERN.test(value) && !Number.isNaN(Date.parse(value));
}

function isJsonRecord(body: unknown): body is Record<string, unknown> {
  return typeof body === 'object' && body !== null && !Array.isArray(body);
}

export class AlertEventPayloadError extends UnprocessableEntityException {
  constructor(readonly field: string) {
    super({
      error: {
        code: 'ALERT_EVENT_PAYLOAD_INVALID',
        field,
        message: 'Alert event payload is invalid.',
      },
    });
  }
}
