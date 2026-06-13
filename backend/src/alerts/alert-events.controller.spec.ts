import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { AlertsModule } from './alerts.module';

type JsonResponseDto = { readonly statusCode: number; readonly body: unknown };

const TEST_ALERT_EVENTS_API_KEY = 'test-alert-events-api-key';

describe('Alerts event ingress /api.alerts/events', () => {
  let app: INestApplication;
  let auditDir: string;
  let webhook: {
    readonly server: Server;
    readonly url: string;
    readonly bodies: unknown[];
  };

  beforeEach(async () => {
    auditDir = await mkdtemp(join(tmpdir(), 'alerts-events-'));
    webhook = await startMockWebhook();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [
            () => ({
              ALERT_CHANNEL: 'webhook',
              ALERT_EVENTS_API_KEY: TEST_ALERT_EVENTS_API_KEY,
              ALERT_POLICY_ENABLED: 'false',
              ALERT_VAR_DIR: auditDir,
              ALERT_WEBHOOK_URL: webhook.url,
              KAKAO_REST_API_KEY: 'test-rest-key',
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
    await closeServer(webhook.server);
    await rm(auditDir, { force: true, recursive: true });
  });

  it('keeps temporary pilot alias POST /events for invalid payload regression', async () => {
    const response = await postJson(
      new URL('/events', await app.getUrl()),
      {
        type: 'fall',
        detected_at: 'not-an-iso-timestamp',
      },
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );

    expect([400, 422]).toContain(response.statusCode);
    await expect(readAuditLines(auditDir)).resolves.toEqual([]);
  });

  it('returns 401 and does not dispatch or audit when POST /api.alerts/events omits the alert API key', async () => {
    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      validFallPayload(),
    );

    expect(response.statusCode).toBe(401);
    expect(webhook.bodies).toHaveLength(0);
    await expect(readAuditLines(auditDir)).resolves.toEqual([]);
  });

  it('returns 403 and does not dispatch or audit when POST /api.alerts/events sends the wrong alert API key', async () => {
    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      validFallPayload(),
      { apiKey: 'wrong-alert-events-api-key' },
    );

    expect(response.statusCode).toBe(403);
    expect(webhook.bodies).toHaveLength(0);
    await expect(readAuditLines(auditDir)).resolves.toEqual([]);
  });

  it('appends one JSONL audit line with W1 fields when POST /api.alerts/events receives a valid fall payload', async () => {
    const payload = validFallPayload();

    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      payload,
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );

    expectAccepted(response);
    const lines = await readAuditLines(auditDir);
    expect(lines).toHaveLength(1);
    const audit = parseJsonObject(lines[0]);
    expect(typeof audit.event_id).toBe('string');
    expect(audit.type).toBe('fall');
    expect(audit.source_id).toBe(payload.source_id);
    expect(audit.detected_at).toBe(payload.detected_at);
    expect(typeof audit.received_at).toBe('string');
    expect(typeof audit.forwarded_at).toBe('string');
    expect(audit.webhook_status).toBe(200);
    expect(audit.confidence).toBe(payload.confidence);
  });

  it('dispatches a valid fall event to mock webhook mode', async () => {
    const payload = validFallPayload();

    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      payload,
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );

    expectAccepted(response);
    expect(webhook.bodies).toHaveLength(1);
    const body = parseJsonObject(webhook.bodies[0]);
    expect(body.type).toBe('fall');
    expect(body.source_id).toBe(payload.source_id);
    expect(body.detected_at).toBe(payload.detected_at);
    expect(typeof body.event_id).toBe('string');
  });

  it('audits and forwards metadata when POST /api.alerts/events receives a valid detection-lost payload', async () => {
    const payload = {
      type: 'detection-lost',
      source_id: 'demo-cam-01',
      detected_at: '2026-06-13T22:15:03.120Z',
    };

    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      payload,
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );

    expectAccepted(response);
    expect(webhook.bodies).toHaveLength(1);
    const body = parseJsonObject(webhook.bodies[0]);
    expect(body.type).toBe('detection-lost');
    expect(body.source_id).toBe(payload.source_id);
    expect(body.detected_at).toBe(payload.detected_at);
    expect(typeof body.event_id).toBe('string');
    expect(typeof body.received_at).toBe('string');
    expect(typeof body.forwarded_at).toBe('string');
    expect(body).not.toHaveProperty('confidence');

    const lines = await readAuditLines(auditDir);
    expect(lines).toHaveLength(1);
    const audit = parseJsonObject(lines[0]);
    expect(audit.type).toBe('detection-lost');
    expect(audit.source_id).toBe(payload.source_id);
    expect(audit.detected_at).toBe(payload.detected_at);
    expect(typeof audit.event_id).toBe('string');
    expect(typeof audit.received_at).toBe('string');
    expect(typeof audit.forwarded_at).toBe('string');
    expect(audit.webhook_status).toBe(200);
    expect(audit).not.toHaveProperty('confidence');
  });

  it('does not call webhook and does not append audit when POST /api.alerts/events payload is invalid', async () => {
    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      {
        type: 'unknown',
        source_id: 'demo-cam-01',
        detected_at: '2026-06-13T22:14:03.120Z',
      },
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );

    expect([400, 422]).toContain(response.statusCode);
    expect(webhook.bodies).toHaveLength(0);
    await expect(readAuditLines(auditDir)).resolves.toEqual([]);
  });

  it('does not call webhook and does not append audit when confidence is nonnumeric', async () => {
    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      {
        ...validFallPayload(),
        confidence: '0.87',
      },
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );

    expect([400, 422]).toContain(response.statusCode);
    expect(webhook.bodies).toHaveLength(0);
    await expect(readAuditLines(auditDir)).resolves.toEqual([]);
  });

  it('does not call webhook and does not append audit when detected_at is date-only', async () => {
    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      {
        ...validFallPayload(),
        detected_at: '2026-06-13',
      },
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );

    expect([400, 422]).toContain(response.statusCode);
    expect(webhook.bodies).toHaveLength(0);
    await expect(readAuditLines(auditDir)).resolves.toEqual([]);
  });

  it('records timeout and appends audit only after a 3s webhook dispatch attempt completes', async () => {
    await app.close();
    await closeServer(webhook.server);
    webhook = await startMockWebhook({ responseDelayMs: 3_500 });

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [
            () => ({
              ALERT_CHANNEL: 'webhook',
              ALERT_EVENTS_API_KEY: TEST_ALERT_EVENTS_API_KEY,
              ALERT_POLICY_ENABLED: 'false',
              ALERT_VAR_DIR: auditDir,
              ALERT_WEBHOOK_URL: webhook.url,
              KAKAO_REST_API_KEY: 'test-rest-key',
              KAKAO_REDIRECT_URI: 'http://localhost:3000/auth/kakao/callback',
            }),
          ],
        }),
        AlertsModule,
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);

    const responsePromise = postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      validFallPayload(),
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );

    await wait(500);
    await expect(readAuditLines(auditDir)).resolves.toEqual([]);

    const response = await responsePromise;

    expectAccepted(response);
    expect(webhook.bodies).toHaveLength(1);
    const lines = await readAuditLines(auditDir);
    expect(lines).toHaveLength(1);
    const audit = parseJsonObject(lines[0]);
    expect(audit.webhook_status).toBe('timeout');
  }, 10_000);

  it('writes 20 uncorrupted JSONL audit lines when 20 valid POST /api.alerts/events requests run concurrently', async () => {
    const baseUrl = await app.getUrl();
    const payloads = Array.from({ length: 20 }, (_, index) => ({
      ...validFallPayload(),
      source_id: `demo-cam-${String(index).padStart(2, '0')}`,
    }));

    const responses = await Promise.all(
      payloads.map((payload) =>
        postJson(new URL('/api.alerts/events', baseUrl), payload, {
          apiKey: TEST_ALERT_EVENTS_API_KEY,
        }),
      ),
    );

    for (const response of responses) {
      expectAccepted(response);
    }
    const lines = await readAuditLines(auditDir);
    expect(lines).toHaveLength(20);
    for (const line of lines) {
      const audit = parseJsonObject(line);
      expect(typeof audit.event_id).toBe('string');
      expect(audit.type).toBe('fall');
      expect(typeof audit.source_id).toBe('string');
      expect(typeof audit.detected_at).toBe('string');
      expect(typeof audit.received_at).toBe('string');
      expect(typeof audit.forwarded_at).toBe('string');
      expect(audit.webhook_status).toBe(200);
    }
  });
});

function validFallPayload() {
  return {
    type: 'fall',
    source_id: 'demo-cam-01',
    detected_at: '2026-06-13T22:14:03.120Z',
    confidence: 0.87,
  };
}

async function postJson(
  url: URL,
  payload: Readonly<Record<string, unknown>>,
  options: { readonly apiKey?: string } = {},
): Promise<JsonResponseDto> {
  const requestBody = JSON.stringify(payload);
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
          'Content-Length': Buffer.byteLength(requestBody),
          'Content-Type': 'application/json',
          ...(options.apiKey === undefined
            ? {}
            : { 'x-alert-api-key': options.apiKey }),
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
    req.end(requestBody);
  });

  return {
    statusCode: response.statusCode,
    body: parseJson(response.body),
  };
}

async function readAuditLines(baseDir: string): Promise<readonly string[]> {
  try {
    const contents = await readFile(join(baseDir, 'audit.jsonl'), 'utf8');
    return contents.split('\n').filter((line) => line.length > 0);
  } catch (error) {
    if (isFileMissing(error)) {
      return [];
    }
    throw error;
  }
}

function isFileMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    Reflect.get(error, 'code') === 'ENOENT'
  );
}

function parseJson(input: string): unknown {
  if (input.length === 0) {
    return {};
  }
  const parsed: unknown = JSON.parse(input);
  return parsed;
}

function parseJsonObject(input: unknown): Record<string, unknown> {
  if (typeof input !== 'string') {
    if (isJsonRecord(input)) {
      return input;
    }
    throw new InvalidTestResponseError('json-object');
  }
  const parsed = parseJson(input);
  if (!isJsonRecord(parsed)) {
    throw new InvalidTestResponseError('json-object');
  }
  return parsed;
}

function isJsonRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function expectAccepted(response: JsonResponseDto): void {
  expect([201, 202]).toContain(response.statusCode);
  const body = parseJsonObject(response.body);
  expect(typeof body.event_id).toBe('string');
}

async function startMockWebhook(
  options: { readonly responseDelayMs?: number } = {},
) {
  const bodies: unknown[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      bodies.push(parseJson(Buffer.concat(chunks).toString('utf8')));
      const respond = () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      };
      if (options.responseDelayMs === undefined) {
        respond();
        return;
      }
      setTimeout(respond, options.responseDelayMs);
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });

  const address = server.address();
  if (typeof address !== 'object' || address === null) {
    throw new InvalidTestResponseError('webhook-address');
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}/hook`,
    bodies,
  };
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
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

class InvalidTestResponseError extends Error {
  constructor(readonly field: string) {
    super(`Invalid test response field: ${field}`);
  }
}
