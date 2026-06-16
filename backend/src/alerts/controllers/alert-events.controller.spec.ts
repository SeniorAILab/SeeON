import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AlertEventTypes } from '../dto/alert-events.dto.js';
import { AlertEventsService } from '../services/alert-events.service.js';
import {
  AlertEventPayloadError,
  AlertEventsController,
  assertAuthorizedAlertEventIngress,
  parseAlertEventIngress,
} from './alert-events.controller.js';

type AlertEventsServiceMock = {
  readonly ingest: jest.MockedFunction<AlertEventsService['ingest']>;
};

describe('AlertEventsController', () => {
  it('requires x-alert-api-key before calling the service', async () => {
    const service = serviceDouble();
    const controller = new AlertEventsController(
      configWithApiKey(),
      service as unknown as AlertEventsService,
    );

    await expect(
      controller.createEvent(undefined, validBody()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.ingest).not.toHaveBeenCalled();
  });

  it('rejects wrong x-alert-api-key before calling the service', async () => {
    const service = serviceDouble();
    const controller = new AlertEventsController(
      configWithApiKey(),
      service as unknown as AlertEventsService,
    );

    await expect(
      controller.createEvent('wrong-key', validBody()),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.ingest).not.toHaveBeenCalled();
  });

  it('requires external_event_id for idempotent trusted ingress', () => {
    expect(() =>
      parseAlertEventIngress({
        type: AlertEventTypes.fall,
        source_id: 'edge-camera-1',
        detected_at: '2026-06-13T10:00:00.000Z',
      }),
    ).toThrow(AlertEventPayloadError);
  });

  it('parses the trusted pilot ingress contract', () => {
    expect(parseAlertEventIngress(validBody())).toEqual({
      type: AlertEventTypes.fall,
      source_id: 'edge-camera-1',
      external_event_id: 'edge-event-1',
      detected_at: '2026-06-13T10:00:00.000Z',
      confidence: 0.87,
    });
  });

  it('treats missing configured API key as operator configuration failure', () => {
    const config = { get: jest.fn(() => '') } as unknown as ConfigService;
    expect(() =>
      assertAuthorizedAlertEventIngress(config, 'submitted'),
    ).toThrow(UnauthorizedException);
  });
});

function configWithApiKey(): ConfigService {
  return {
    get: jest.fn((key: string) => {
      if (key === 'ALERT_EVENTS_API_KEY') {
        return 'expected-key';
      }
      return undefined;
    }),
  } as unknown as ConfigService;
}

function serviceDouble(): AlertEventsServiceMock {
  return {
    ingest: jest.fn(),
  };
}

function validBody() {
  return {
    type: AlertEventTypes.fall,
    source_id: 'edge-camera-1',
    external_event_id: 'edge-event-1',
    detected_at: '2026-06-13T10:00:00.000Z',
    confidence: 0.87,
  };
}
