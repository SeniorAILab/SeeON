export type KakaoOAuthClientDto = {
  readonly restApiKey: string;
  readonly redirectUri: string;
};

export type BuildKakaoAuthorizeUrlDto = {
  readonly oauth: KakaoOAuthClientDto;
  readonly state?: string;
};

export type ExchangeKakaoAuthorizationCodeDto = {
  readonly oauth: KakaoOAuthClientDto;
  readonly code: string;
};

export type KakaoTokenResponseDto = {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_in: number;
  readonly refresh_token_expires_in: number;
};

export type KakaoRefreshTokenResponseDto = {
  readonly access_token: string;
  readonly expires_in: number;
  readonly refresh_token?: string;
  readonly refresh_token_expires_in?: number;
};

export type KakaoTokenFileDto = {
  readonly access_token: string;
  readonly refresh_token: string;
  readonly expires_at: string;
  readonly refresh_expires_at: string;
};

export type RedactedKakaoTokenSummaryDto = {
  readonly access_token_present: boolean;
  readonly refresh_token_present: boolean;
  readonly expires_at: string;
  readonly refresh_expires_at: string;
};
