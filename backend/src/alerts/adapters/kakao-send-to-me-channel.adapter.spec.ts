import {
  classifyKakaoDeliveryFailure,
  KakaoConfigError,
  KakaoSendHttpError,
  KakaoSendNetworkError,
  KakaoSendTimeoutError,
  KakaoTokenFileError,
} from './kakao-send-to-me-channel.adapter.js';

describe('Kakao delivery failure classification', () => {
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
