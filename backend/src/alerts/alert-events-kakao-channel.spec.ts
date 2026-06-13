import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { createServer, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { AlertsModule } from './alerts.module';

const TEST_ALERT_EVENTS_API_KEY = 'test-alert-events-api-key';

describe('Alerts Kakao channel fallback', () => {
  let app: INestApplication;
  let auditDir: string;
  let tokenPath: string;
  let kakaoApi: MockKakaoApi;
  let webhook: MockWebhook;

  beforeEach(async () => {
    auditDir = await mkdtemp(join(tmpdir(), 'alerts-kakao-audit-'));
    const tokenDir = await mkdtemp(join(tmpdir(), 'alerts-kakao-token-'));
    tokenPath = join(tokenDir, 'kakao-token.json');
    kakaoApi = await startMockKakaoApi();
    webhook = await startMockWebhook();
  });

  afterEach(async () => {
    await app?.close();
    await kakaoApi.close();
    await webhook.close();
    await rm(auditDir, { force: true, recursive: true });
    await rm(join(tokenPath, '..'), { force: true, recursive: true });
  });

  it('audits Kakao send success without falling back to webhook', async () => {
    await writeTokenFile(tokenPath, {
      access_token: 'test-access-current',
      refresh_token: 'test-refresh-current',
      expires_at: '2026-06-13T23:00:00.000Z',
      refresh_expires_at: '2026-08-13T22:00:00.000Z',
    });
    await startApp({
      ALERT_WEBHOOK_URL: webhook.url,
      KAKAO_MESSAGE_ENDPOINT: kakaoApi.messageUrl,
      KAKAO_TOKEN_PATH: tokenPath,
    });

    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      {
        type: 'fall',
        source_id: 'demo-cam-01',
        detected_at: '2026-06-13T22:14:03.120Z',
        confidence: 0.87,
      },
    );

    expect(response.statusCode).toBe(201);
    expect(kakaoApi.messageRequests).toHaveLength(1);
    expect(webhook.bodies).toHaveLength(0);
    const audit = await readSingleAudit();
    expect(audit.channel_status).toBe('kakao_sent');
    expect(audit.webhook_status).toBe('disabled');
    expect(JSON.stringify(audit)).not.toContain('test-access-current');
  });

  it('rejects unauthenticated Kakao-mode event ingress before send or audit', async () => {
    await writeTokenFile(tokenPath, {
      access_token: 'test-access-current',
      refresh_token: 'test-refresh-current',
      expires_at: '2026-06-13T23:00:00.000Z',
      refresh_expires_at: '2026-08-13T22:00:00.000Z',
    });
    await startApp({
      ALERT_WEBHOOK_URL: webhook.url,
      KAKAO_MESSAGE_ENDPOINT: kakaoApi.messageUrl,
      KAKAO_TOKEN_PATH: tokenPath,
    });

    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      {
        type: 'fall',
        source_id: 'demo-cam-01',
        detected_at: '2026-06-13T22:14:03.120Z',
        confidence: 0.87,
      },
      { apiKey: undefined },
    );

    expect(response.statusCode).toBe(401);
    expect(kakaoApi.messageRequests).toHaveLength(0);
    expect(webhook.bodies).toHaveLength(0);
    await expect(readAuditObjects()).resolves.toEqual([]);
  });

  it('fails closed before Kakao send when the alert event API key is not configured', async () => {
    await writeTokenFile(tokenPath, {
      access_token: 'test-access-current',
      refresh_token: 'test-refresh-current',
      expires_at: '2026-06-13T23:00:00.000Z',
      refresh_expires_at: '2026-08-13T22:00:00.000Z',
    });
    await startApp({
      ALERT_EVENTS_API_KEY: '',
      ALERT_WEBHOOK_URL: webhook.url,
      KAKAO_MESSAGE_ENDPOINT: kakaoApi.messageUrl,
      KAKAO_TOKEN_PATH: tokenPath,
    });

    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      {
        type: 'fall',
        source_id: 'demo-cam-01',
        detected_at: '2026-06-13T22:14:03.120Z',
        confidence: 0.87,
      },
    );

    expect(response.statusCode).toBe(401);
    expect(kakaoApi.messageRequests).toHaveLength(0);
    expect(webhook.bodies).toHaveLength(0);
    await expect(readAuditObjects()).resolves.toEqual([]);
  });

  it('preserves validation semantics for authenticated malformed Kakao-mode payloads', async () => {
    await writeTokenFile(tokenPath, {
      access_token: 'test-access-current',
      refresh_token: 'test-refresh-current',
      expires_at: '2026-06-13T23:00:00.000Z',
      refresh_expires_at: '2026-08-13T22:00:00.000Z',
    });
    await startApp({
      ALERT_WEBHOOK_URL: webhook.url,
      KAKAO_MESSAGE_ENDPOINT: kakaoApi.messageUrl,
      KAKAO_TOKEN_PATH: tokenPath,
    });

    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      {
        type: 'fall',
        source_id: 'demo-cam-01',
        detected_at: 'not-an-iso-timestamp',
        confidence: 0.87,
      },
    );

    expect(response.statusCode).toBe(422);
    expect(kakaoApi.messageRequests).toHaveLength(0);
    expect(webhook.bodies).toHaveLength(0);
    await expect(readAuditObjects()).resolves.toEqual([]);
  });

  it('refreshes an expired token, records Kakao failure, and falls back to webhook', async () => {
    await writeTokenFile(tokenPath, {
      access_token: 'test-access-expired',
      refresh_token: 'test-refresh-current',
      expires_at: '2000-01-01T00:00:00.000Z',
      refresh_expires_at: '2026-08-13T22:00:00.000Z',
    });
    kakaoApi.enqueueRefreshResponse({
      access_token: 'test-access-refreshed',
      token_type: 'bearer',
      expires_in: 3600,
    });
    kakaoApi.failNextMessage(500);
    await startApp({
      ALERT_WEBHOOK_URL: webhook.url,
      KAKAO_MESSAGE_ENDPOINT: kakaoApi.messageUrl,
      KAKAO_REST_API_KEY: 'test-rest-key',
      KAKAO_TOKEN_ENDPOINT: kakaoApi.tokenUrl,
      KAKAO_TOKEN_PATH: tokenPath,
    });

    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      {
        type: 'fall',
        source_id: 'demo-cam-01',
        detected_at: '2026-06-13T22:14:03.120Z',
        confidence: 0.87,
      },
    );

    expect(response.statusCode).toBe(201);
    expect(kakaoApi.refreshRequests).toHaveLength(1);
    expect(kakaoApi.messageRequests[0]?.authorizationToken).toBe(
      'test-access-refreshed',
    );
    expect(webhook.bodies).toHaveLength(1);
    const audit = await readSingleAudit();
    expect(audit.channel_status).toBe('kakao_failed_webhook_fallback');
    expect(audit.kakao_status).toBe('failed');
    expect(audit.webhook_status).toBe(200);
    expect(JSON.stringify(audit)).not.toContain('test-access-refreshed');
    expect(JSON.stringify(audit)).not.toContain('test-refresh-current');
  });

  async function startApp(values: Readonly<Record<string, string>>) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [
            () => ({
              ALERT_CHANNEL: 'kakao',
              ALERT_EVENTS_API_KEY: TEST_ALERT_EVENTS_API_KEY,
              ALERT_POLICY_ENABLED: 'false',
              ALERT_VAR_DIR: auditDir,
              KAKAO_REST_API_KEY: 'test-rest-key',
              ...values,
            }),
          ],
        }),
        AlertsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
  }

  async function readSingleAudit(): Promise<Record<string, unknown>> {
    const audits = await readAuditObjects();
    expect(audits).toHaveLength(1);
    const audit = audits[0];
    if (audit === undefined) {
      throw new InvalidTestFixtureError('audit');
    }
    return audit;
  }

  async function readAuditObjects(): Promise<
    readonly Record<string, unknown>[]
  > {
    const contents = await readFile(join(auditDir, 'audit.jsonl'), 'utf8');
    return contents
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => parseAuditObject(line));
  }
});

type MockKakaoRequest = {
  readonly authorizationToken: string;
};

type MockRefreshRequest = {
  readonly refreshToken: string | null;
};

type MockKakaoApi = {
  readonly messageUrl: string;
  readonly tokenUrl: string;
  readonly messageRequests: readonly MockKakaoRequest[];
  readonly refreshRequests: readonly MockRefreshRequest[];
  readonly enqueueRefreshResponse: (
    body: Readonly<Record<string, string | number>>,
  ) => void;
  readonly failNextMessage: (statusCode: number) => void;
  readonly close: () => Promise<void>;
};

type MockWebhook = {
  readonly url: string;
  readonly bodies: readonly unknown[];
  readonly close: () => Promise<void>;
};

async function startMockKakaoApi(): Promise<MockKakaoApi> {
  const messageRequests: MockKakaoRequest[] = [];
  const refreshRequests: MockRefreshRequest[] = [];
  const refreshResponses: Readonly<Record<string, string | number>>[] = [];
  const messageFailureCodes: number[] = [];
  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (req.url === '/oauth/token') {
        const form = new URLSearchParams(body);
        refreshRequests.push({ refreshToken: form.get('refresh_token') });
        respondJson(res, 200, refreshResponses.shift() ?? {});
        return;
      }
      if (req.url === '/v2/api/talk/memo/default/send') {
        const authorization = req.headers.authorization ?? '';
        messageRequests.push({
          authorizationToken: authorization.replace(/^Bearer /, ''),
        });
        respondJson(res, messageFailureCodes.shift() ?? 200, {
          result_code: 0,
        });
        return;
      }
      respondJson(res, 404, { error: 'not-found' });
    });
  });
  await listen(server);
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new InvalidTestFixtureError('kakao-address');
  }
  const baseUrl = `http://127.0.0.1:${address.port}`;
  return {
    messageUrl: `${baseUrl}/v2/api/talk/memo/default/send`,
    tokenUrl: `${baseUrl}/oauth/token`,
    messageRequests,
    refreshRequests,
    enqueueRefreshResponse: (body) => refreshResponses.push(body),
    failNextMessage: (statusCode) => messageFailureCodes.push(statusCode),
    close: () => closeServer(server),
  };
}

async function startMockWebhook(): Promise<MockWebhook> {
  const bodies: unknown[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      respondJson(res, 200, { ok: true });
    });
  });
  await listen(server);
  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new InvalidTestFixtureError('webhook-address');
  }
  return {
    url: `http://127.0.0.1:${address.port}/hook`,
    bodies,
    close: () => closeServer(server),
  };
}

async function postJson(
  url: URL,
  payload: Readonly<Record<string, unknown>>,
  options: { readonly apiKey?: string | undefined } = {
    apiKey: TEST_ALERT_EVENTS_API_KEY,
  },
): Promise<{ readonly statusCode: number }> {
  const body = JSON.stringify(payload);
  const headers: Record<string, string | number> = {
    'Content-Length': Buffer.byteLength(body),
    'Content-Type': 'application/json',
  };
  if (options.apiKey !== undefined) {
    headers['x-alert-api-key'] = options.apiKey;
  }
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      url,
      {
        method: 'POST',
        headers,
      },
      (res) => {
        res.resume();
        res.on('end', () => resolve({ statusCode: res.statusCode ?? 0 }));
      },
    );
    req.on('error', reject);
    req.end(body);
  });
}

function parseAuditObject(input: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(input);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InvalidTestFixtureError('audit');
  }
  return parsed as Record<string, unknown>;
}

async function writeTokenFile(
  path: string,
  token: Readonly<Record<string, string>>,
): Promise<void> {
  await writeFile(path, `${JSON.stringify(token, null, 2)}\n`, {
    mode: 0o600,
  });
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
  statusCode: number,
  body: Readonly<Record<string, unknown>>,
): void {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

class InvalidTestFixtureError extends Error {
  constructor(readonly field: string) {
    super(`Invalid test fixture field: ${field}`);
  }
}
