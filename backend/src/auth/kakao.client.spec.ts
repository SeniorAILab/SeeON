import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KakaoClient } from './kakao.client';

function client(env: Record<string, string> = {}): KakaoClient {
  return new KakaoClient(
    new ConfigService({
      KAKAO_REST_API_KEY: 'test-rest-api-key',
      KAKAO_REDIRECT_URI: 'http://localhost/auth/kakao/callback',
      ...env,
    }),
  );
}

function scopeOf(c: KakaoClient): string | null {
  return new URL(c.buildAuthorizeUrl('test-state')).searchParams.get('scope');
}

describe('KakaoClient.buildAuthorizeUrl scope resolution', () => {
  it('defaults to the minimal talk_message scope when KAKAO_SCOPES is unset', () => {
    expect(scopeOf(client())).toBe('talk_message');
  });

  it('does not request profile_nickname by default', () => {
    expect(scopeOf(client())?.split(' ')).not.toContain('profile_nickname');
  });

  it('honors an explicit KAKAO_SCOPES value', () => {
    expect(
      scopeOf(client({ KAKAO_SCOPES: 'talk_message profile_nickname' })),
    ).toBe('talk_message profile_nickname');
  });

  it('normalizes comma/whitespace separators and deduplicates scopes', () => {
    expect(
      scopeOf(
        client({
          KAKAO_SCOPES: ' talk_message,  talk_message ,profile_nickname ',
        }),
      ),
    ).toBe('talk_message profile_nickname');
  });

  it('falls back to the default when KAKAO_SCOPES is blank', () => {
    expect(scopeOf(client({ KAKAO_SCOPES: '   ' }))).toBe('talk_message');
  });

  it('rejects a malformed scope token containing control characters', () => {
    expect(() =>
      scopeOf(client({ KAKAO_SCOPES: 'talk_message bad\u0001scope' })),
    ).toThrow(ServiceUnavailableException);
  });

  it('still sets the standard authorize params', () => {
    const url = new URL(client().buildAuthorizeUrl('test-state'));
    expect(url.searchParams.get('client_id')).toBe('test-rest-api-key');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost/auth/kakao/callback',
    );
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('state')).toBe('test-state');
  });

  it('rejects the local placeholder REST API key before redirecting to Kakao', () => {
    expect(() =>
      client({
        KAKAO_REST_API_KEY: 'dev-placeholder-kakao-rest-api-key',
      }).buildAuthorizeUrl('test-state'),
    ).toThrow(ServiceUnavailableException);
  });

  it('resolveScopes is reusable for token-scope alignment (no broad fallback)', () => {
    expect(client().resolveScopes()).toBe('talk_message');
    expect(client().resolveScopes()).not.toContain('profile_nickname');
  });
});
