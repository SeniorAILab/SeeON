import { ConfigService } from '@nestjs/config';
import { KakaoClient } from './kakao.client';

describe('KakaoClient', () => {
  it('includes the Kakao message and nickname scopes in authorize urls', () => {
    const client = new KakaoClient(
      new ConfigService({
        KAKAO_REST_API_KEY: 'test-rest-api-key',
        KAKAO_REDIRECT_URI: 'http://localhost/auth/kakao/callback',
      }),
    );

    const authorizeUrl = new URL(client.buildAuthorizeUrl('test-state'));

    expect(authorizeUrl.searchParams.get('scope')).toBe(
      'talk_message profile_nickname',
    );
    expect(authorizeUrl.searchParams.get('client_id')).toBe(
      'test-rest-api-key',
    );
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      'http://localhost/auth/kakao/callback',
    );
    expect(authorizeUrl.searchParams.get('response_type')).toBe('code');
    expect(authorizeUrl.searchParams.get('state')).toBe('test-state');
  });
});
