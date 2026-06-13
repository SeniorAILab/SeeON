import { request as httpRequest } from 'node:http';

import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { AlertsModule } from './alerts.module';

type JsonResponseDto = {
  readonly statusCode: number;
  readonly body: unknown;
};

const SENTINEL_REST_API_KEY = 'sentinel-rest-api-key-123';
const KAKAO_AUTHORIZE_URL_MARKER = [
  'https://kauth.kakao.com',
  '/oauth/authorize',
].join('');
const CLIENT_ID_QUERY_MARKER = ['client', '_id='].join('');

describe('AlertsController API', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [
            () => ({
              KAKAO_REST_API_KEY: SENTINEL_REST_API_KEY,
              KAKAO_REDIRECT_URI: 'http://localhost:3000/auth/kakao/callback',
            }),
          ],
        }),
        AlertsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
  });

  afterEach(async () => {
    await app.close();
  });

  it('does not disclose a Kakao authorization URL to unauthenticated callers', async () => {
    const baseUrl = await app.getUrl();
    const response = await postJson(
      new URL('/api.alerts/kakao/oauth/authorization-urls', baseUrl),
    );
    const responseBody = JSON.stringify(response.body);

    expect(response.statusCode).toBe(404);
    expect(responseBody).not.toContain(KAKAO_AUTHORIZE_URL_MARKER);
    expect(responseBody).not.toContain(CLIENT_ID_QUERY_MARKER);
    expect(responseBody).not.toContain(SENTINEL_REST_API_KEY);
  });
});

async function postJson(url: URL): Promise<JsonResponseDto> {
  const response = await new Promise<{
    readonly statusCode: number;
    readonly body: string;
  }>((resolve, reject) => {
    const req = httpRequest(
      url,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });

  return {
    statusCode: response.statusCode,
    body: parseJsonBody(response.body),
  };
}

function parseJsonBody(input: string): unknown {
  const parsed: unknown = JSON.parse(input);
  return parsed;
}
