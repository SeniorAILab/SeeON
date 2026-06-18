import {
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface KakaoTokenResponse {
  access_token: string;
  expires_in?: number;
  scope?: string;
}

export interface KakaoProfile {
  kakaoId: string;
  email: string | null;
  nickname: string;
}

@Injectable()
export class KakaoClient implements OnModuleInit {
  constructor(private readonly config: ConfigService) {}

  private static readonly DEFAULT_SCOPE = 'talk_message';
  private static readonly SCOPE_TOKEN_PATTERN = /^[A-Za-z0-9_.:-]+$/;

  onModuleInit(): void {
    requiredConfig(this.config, 'KAKAO_REST_API_KEY');
    requiredConfig(this.config, 'KAKAO_REDIRECT_URI');
  }

  buildAuthorizeUrl(state: string): string {
    const restApiKey = requiredConfig(this.config, 'KAKAO_REST_API_KEY');
    const redirectUri = requiredConfig(this.config, 'KAKAO_REDIRECT_URI');
    const url = new URL('https://kauth.kakao.com/oauth/authorize');
    url.searchParams.set('client_id', restApiKey);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', state);
    url.searchParams.set('scope', this.resolveScopes());
    return url.toString();
  }

  /**
   * Resolve the OAuth scopes from KAKAO_SCOPES (space/comma separated).
   * Defaults to the minimal `talk_message` scope (no profile_nickname) so a
   * missing profile_nickname consent item cannot cause invalid_scope.
   * Throws on a malformed scope token (e.g. control characters).
   */
  resolveScopes(): string {
    const raw = this.config.get<string>('KAKAO_SCOPES');
    if (raw === undefined || raw === null) return KakaoClient.DEFAULT_SCOPE;
    const tokens = raw
      .split(/[\s,]+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    if (tokens.length === 0) return KakaoClient.DEFAULT_SCOPE;
    const seen = new Set<string>();
    const normalized: string[] = [];
    for (const token of tokens) {
      if (!KakaoClient.SCOPE_TOKEN_PATTERN.test(token))
        throw new ServiceUnavailableException(
          `KAKAO_SCOPES contains an invalid scope token: ${JSON.stringify(token)}`,
        );
      if (!seen.has(token)) {
        seen.add(token);
        normalized.push(token);
      }
    }
    return normalized.join(' ');
  }

  async exchangeCode(code: string): Promise<KakaoTokenResponse> {
    const restApiKey = requiredConfig(this.config, 'KAKAO_REST_API_KEY');
    const redirectUri = requiredConfig(this.config, 'KAKAO_REDIRECT_URI');
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: restApiKey,
      redirect_uri: redirectUri,
      code,
    });
    const clientSecret = this.config.get<string>('KAKAO_CLIENT_SECRET');
    if (clientSecret) body.set('client_secret', clientSecret);

    const response = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body,
    });
    if (!response.ok)
      throw new ServiceUnavailableException('Kakao token exchange failed');
    return (await response.json()) as KakaoTokenResponse;
  }

  async getProfile(accessToken: string): Promise<KakaoProfile> {
    const response = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok)
      throw new ServiceUnavailableException('Kakao profile request failed');
    const payload = (await response.json()) as {
      id?: number;
      kakao_account?: { email?: string; profile?: { nickname?: string } };
      properties?: { nickname?: string };
    };
    if (typeof payload.id !== 'number')
      throw new ServiceUnavailableException('Kakao profile missing id');
    return {
      kakaoId: String(payload.id),
      email: payload.kakao_account?.email ?? null,
      nickname:
        payload.kakao_account?.profile?.nickname ??
        payload.properties?.nickname ??
        'Kakao User',
    };
  }
}

function requiredConfig(config: ConfigService, key: string): string {
  const value = config.get<string>(key);
  if (!value) throw new ServiceUnavailableException(`${key} is required`);
  return value;
}
