import type { BuildKakaoAuthorizeUrlDto } from '../dto/kakao-oauth.dto';
import { KakaoOAuthService } from './kakao-oauth.service';

describe('Kakao OAuth bootstrap', () => {
  const service = new KakaoOAuthService();

  it('builds the Kakao consent URL with talk_message scope', () => {
    const dto: BuildKakaoAuthorizeUrlDto = {
      oauth: {
        restApiKey: 'test-rest-key',
        redirectUri: 'http://localhost:3000/auth/kakao/callback',
      },
      state: 'state-123',
    };

    const url = service.buildAuthorizeUrl(dto);

    expect(url).toBe(
      'https://kauth.kakao.com/oauth/authorize?' +
        'client_id=test-rest-key&' +
        'redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fauth%2Fkakao%2Fcallback&' +
        'response_type=code&' +
        'scope=talk_message&' +
        'state=state-123',
    );
  });

  it('normalizes Kakao token response into an explicit DTO', () => {
    const dto = service.parseKakaoTokenResponseDto({
      token_type: 'bearer',
      access_token: 'test-access-1',
      expires_in: 3600,
      refresh_token: 'test-refresh-1',
      refresh_token_expires_in: 60 * 60 * 24 * 60,
    });

    expect(dto).toEqual({
      access_token: 'test-access-1',
      refresh_token: 'test-refresh-1',
      expires_in: 3600,
      refresh_token_expires_in: 60 * 60 * 24 * 60,
    });
  });

  it('parses token response into absolute expiry timestamps', () => {
    const token = service.parseKakaoTokenResponse(
      {
        token_type: 'bearer',
        access_token: 'test-access-1',
        expires_in: 3600,
        refresh_token: 'test-refresh-1',
        refresh_token_expires_in: 60 * 60 * 24 * 60,
      },
      new Date('2026-06-13T00:00:00.000Z'),
    );

    expect(token).toEqual({
      access_token: 'test-access-1',
      refresh_token: 'test-refresh-1',
      expires_at: '2026-06-13T01:00:00.000Z',
      refresh_expires_at: '2026-08-12T00:00:00.000Z',
    });
  });
});
