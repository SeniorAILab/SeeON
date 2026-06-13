import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { ConfigService } from '@nestjs/config';

import type { AlertWebhookPayloadDto } from '../dto/alert-events.dto';
import { KakaoOAuthService } from './kakao-oauth.service';
import { KakaoSenderService } from './kakao-sender.service';

describe('KakaoSenderService', () => {
  let tempDir: string;
  let tokenPath: string;
  let kakaoApi: MockKakaoApi;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'kakao-sender-'));
    tokenPath = join(tempDir, 'kakao-token.json');
    kakaoApi = await startMockKakaoApi();
  });

  afterEach(async () => {
    await kakaoApi.close();
    await rm(tempDir, { force: true, recursive: true });
  });

  it('sends a default template to Kakao send-to-me with a bearer token', async () => {
    await writeTokenFile(tokenPath, {
      access_token: 'test-access-current',
      refresh_token: 'test-refresh-current',
      expires_at: '2026-06-13T23:00:00.000Z',
      refresh_expires_at: '2026-08-13T22:00:00.000Z',
    });
    const service = newService({
      KAKAO_MESSAGE_ENDPOINT: kakaoApi.messageUrl,
      KAKAO_TOKEN_PATH: tokenPath,
    });

    const result = await service.send(validPayload(), {
      now: new Date('2026-06-13T22:14:03.120Z'),
    });

    expect(result).toEqual({ status: 'sent' });
    expect(kakaoApi.messageRequests).toHaveLength(1);
    const request = kakaoApi.messageRequests[0];
    expect(request?.authorizationHeaderPresent).toBe(true);
    expect(request?.authorizationHeaderPreview).toBe('Bearer <redacted>');
    const template = request?.templateObject;
    expect(template).toMatchObject({
      object_type: 'text',
      link: {
        web_url: 'http://localhost:3000',
        mobile_web_url: 'http://localhost:3000',
      },
    });
    expect(template?.text).toContain('fall');
    expect(template?.text).toContain('demo-cam-01');
  });

  it('refreshes an expired access token before sending and atomically updates the token file', async () => {
    await writeTokenFile(tokenPath, {
      access_token: 'test-access-expired',
      refresh_token: 'test-refresh-current',
      expires_at: '2026-06-13T22:10:00.000Z',
      refresh_expires_at: '2026-08-13T22:00:00.000Z',
    });
    kakaoApi.enqueueRefreshResponse({
      access_token: 'test-access-refreshed',
      token_type: 'bearer',
      expires_in: 3600,
    });
    const service = newService({
      KAKAO_MESSAGE_ENDPOINT: kakaoApi.messageUrl,
      KAKAO_REST_API_KEY: 'test-rest-key',
      KAKAO_TOKEN_ENDPOINT: kakaoApi.tokenUrl,
      KAKAO_TOKEN_PATH: tokenPath,
    });

    const result = await service.send(validPayload(), {
      now: new Date('2026-06-13T22:14:03.120Z'),
    });

    expect(result).toEqual({ status: 'sent' });
    expect(kakaoApi.refreshRequests).toHaveLength(1);
    expect(kakaoApi.refreshRequests[0]).toMatchObject({
      grantType: 'refresh_token',
      clientId: 'test-rest-key',
      refreshToken: 'test-refresh-current',
    });
    expect(kakaoApi.messageRequests[0]?.authorizationToken).toBe(
      'test-access-refreshed',
    );
    const token = parseTokenFile(await readFile(tokenPath, 'utf8'));
    expect(token).toEqual({
      access_token: 'test-access-refreshed',
      refresh_token: 'test-refresh-current',
      expires_at: '2026-06-13T23:14:03.120Z',
      refresh_expires_at: '2026-08-13T22:00:00.000Z',
    });
  });

  it('rejects a corrupt token file before making a Kakao request', async () => {
    await mkdir(dirname(tokenPath), { recursive: true });
    await writeFile(tokenPath, '{not-json', 'utf8');
    const service = newService({
      KAKAO_MESSAGE_ENDPOINT: kakaoApi.messageUrl,
      KAKAO_TOKEN_PATH: tokenPath,
    });

    await expect(
      service.send(validPayload(), {
        now: new Date('2026-06-13T22:14:03.120Z'),
      }),
    ).rejects.toThrow('Invalid Kakao token file field: json');
    expect(kakaoApi.messageRequests).toHaveLength(0);
  });

  it('redacts token values in token metadata summaries', () => {
    const service = newService({});

    const summary = service.redactedTokenMetadata({
      access_token: 'test-access-current',
      refresh_token: 'test-refresh-current',
      expires_at: '2026-06-13T23:00:00.000Z',
      refresh_expires_at: '2026-08-13T22:00:00.000Z',
    });

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('test-access-current');
    expect(serialized).not.toContain('test-refresh-current');
    expect(summary).toEqual({
      access_token_present: true,
      refresh_token_present: true,
      expires_at: '2026-06-13T23:00:00.000Z',
      refresh_expires_at: '2026-08-13T22:00:00.000Z',
    });
  });
});

function newService(
  values: Readonly<Record<string, string>>,
): KakaoSenderService {
  return new KakaoSenderService(
    new ConfigService({
      KAKAO_REST_API_KEY: 'test-rest-key',
      ...values,
    }),
    new KakaoOAuthService(),
  );
}

function validPayload(): AlertWebhookPayloadDto {
  return {
    event_id: 'event-1',
    type: 'fall',
    source_id: 'demo-cam-01',
    detected_at: '2026-06-13T22:14:03.120Z',
    received_at: '2026-06-13T22:14:03.220Z',
    forwarded_at: '2026-06-13T22:14:03.320Z',
    confidence: 0.87,
  };
}

async function writeTokenFile(
  path: string,
  token: Readonly<Record<string, string>>,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(token, null, 2)}\n`, {
    mode: 0o600,
  });
}

function parseTokenFile(input: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(input);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InvalidTestFixtureError('token-file');
  }
  return parsed as Record<string, unknown>;
}

type MockMessageRequest = {
  readonly authorizationHeaderPresent: boolean;
  readonly authorizationHeaderPreview: string;
  readonly authorizationToken: string;
  readonly templateObject: Record<string, unknown>;
};

type MockRefreshRequest = {
  readonly grantType: string | null;
  readonly clientId: string | null;
  readonly refreshToken: string | null;
};

type MockKakaoApi = {
  readonly messageUrl: string;
  readonly tokenUrl: string;
  readonly messageRequests: readonly MockMessageRequest[];
  readonly refreshRequests: readonly MockRefreshRequest[];
  readonly enqueueRefreshResponse: (
    body: Readonly<Record<string, string | number>>,
  ) => void;
  readonly close: () => Promise<void>;
};

async function startMockKakaoApi(): Promise<MockKakaoApi> {
  const messageRequests: MockMessageRequest[] = [];
  const refreshRequests: MockRefreshRequest[] = [];
  const refreshResponses: Readonly<Record<string, string | number>>[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (req.url === '/oauth/token') {
        const form = new URLSearchParams(body);
        refreshRequests.push({
          grantType: form.get('grant_type'),
          clientId: form.get('client_id'),
          refreshToken: form.get('refresh_token'),
        });
        respondJson(res, refreshResponses.shift() ?? {});
        return;
      }
      if (req.url === '/v2/api/talk/memo/default/send') {
        const form = new URLSearchParams(body);
        const authorization = req.headers.authorization ?? '';
        messageRequests.push({
          authorizationHeaderPresent: authorization.startsWith('Bearer '),
          authorizationHeaderPreview: authorization.startsWith('Bearer ')
            ? 'Bearer <redacted>'
            : '<missing>',
          authorizationToken: authorization.replace(/^Bearer /, ''),
          templateObject: parseFormJson(form.get('template_object')),
        });
        respondJson(res, { result_code: 0 });
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });

  await listen(server);
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new InvalidTestFixtureError('mock-address');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    messageUrl: `${baseUrl}/v2/api/talk/memo/default/send`,
    tokenUrl: `${baseUrl}/oauth/token`,
    messageRequests,
    refreshRequests,
    enqueueRefreshResponse: (body) => refreshResponses.push(body),
    close: () => closeServer(server),
  };
}

async function listen(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function respondJson(
  res: ServerResponse<IncomingMessage>,
  body: Readonly<Record<string, unknown>>,
): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function parseFormJson(value: string | null): Record<string, unknown> {
  if (value === null) {
    throw new InvalidTestFixtureError('template_object');
  }
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InvalidTestFixtureError('template_object');
  }
  return parsed as Record<string, unknown>;
}

class InvalidTestFixtureError extends Error {
  constructor(readonly field: string) {
    super(`Invalid test fixture field: ${field}`);
  }
}
