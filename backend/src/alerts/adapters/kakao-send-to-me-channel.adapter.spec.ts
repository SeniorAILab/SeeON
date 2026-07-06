import { Logger } from '@nestjs/common';
import {
  KakaoSendToMeChannelAdapter,
  classifyKakaoDeliveryFailure,
  KakaoConfigError,
  KakaoSendHttpError,
  KakaoSendNetworkError,
  KakaoSendTimeoutError,
  KakaoTokenFileError,
  notConfiguredKakaoDelivery,
} from './kakao-send-to-me-channel.adapter.js';


const alertMessage = {
  event_id: 'event-1',
  delivery_attempt_id: 'delivery-attempt-1',
  created_at: new Date('2026-07-06T00:00:00.000Z'),
  type: 'fall',
  source_id: 'cam-1',
  external_event_id: 'external-1',
  detected_at: '2026-07-06T00:00:00.000Z',
} as const;

describe('Kakao delivery failure classification', () => {
  it('returns explicit NOT_CONFIGURED delivery failure and warns when recipient token is absent', async () => {
    const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    const adapter = new KakaoSendToMeChannelAdapter({
      get: jest.fn(),
    } as never);

    await expect(adapter.send(alertMessage)).resolves.toEqual(
      notConfiguredKakaoDelivery(),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      'Kakao send-to-me skipped: recipient access token not configured for delivery_attempt_id=delivery-attempt-1',
    );
    warnSpy.mockRestore();
  });
  it('classifies timeout, network, and provider 5xx failures as retryable transient failures', () => {
    expect(classifyKakaoDeliveryFailure(new KakaoSendTimeoutError())).toEqual(
      expect.objectContaining({ kind: 'failed', failure_class: 'transient' }),
    );
    expect(
      classifyKakaoDeliveryFailure(new KakaoSendNetworkError('ECONNRESET')),
    ).toEqual(
      expect.objectContaining({ kind: 'failed', failure_class: 'transient' }),
    );
    expect(classifyKakaoDeliveryFailure(new KakaoSendHttpError(503))).toEqual(
      expect.objectContaining({ kind: 'failed', failure_class: 'transient' }),
    );
  });

  it('classifies provider 4xx, missing config, and invalid token files as terminal operator-action failures', () => {
    expect(classifyKakaoDeliveryFailure(new KakaoSendHttpError(401))).toEqual(
      expect.objectContaining({
        kind: 'failed',
        failure_class: 'terminal_operator_action',
      }),
    );
    expect(classifyKakaoDeliveryFailure(new KakaoSendHttpError(429))).toEqual(
      expect.objectContaining({
        kind: 'failed',
        failure_class: 'terminal_operator_action',
      }),
    );
    expect(classifyKakaoDeliveryFailure(new KakaoSendHttpError(404))).toEqual(
      expect.objectContaining({
        kind: 'failed',
        failure_class: 'terminal_operator_action',
      }),
    );
    expect(
      classifyKakaoDeliveryFailure(new KakaoConfigError('KAKAO_TOKEN_PATH')),
    ).toEqual(
      expect.objectContaining({
        kind: 'failed',
        failure_class: 'terminal_operator_action',
      }),
    );
    expect(
      classifyKakaoDeliveryFailure(new KakaoTokenFileError('json')),
    ).toEqual(
      expect.objectContaining({
        kind: 'failed',
        failure_class: 'terminal_operator_action',
      }),
    );
  });
});
