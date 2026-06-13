import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { AlertsModule } from './alerts.module';
import { AlertEventTypes } from './dto/alert-events.dto';
import { AlertPolicyClock } from './services/alert-policy.service';

type JsonResponseDto = { readonly statusCode: number; readonly body: unknown };

const TEST_ALERT_EVENTS_API_KEY = 'test-alert-events-api-key';

describe('Alert policy integration /api.alerts/events', () => {
  let app: INestApplication;
  let auditDir: string;
  let webhook: {
    readonly server: Server;
    readonly url: string;
    readonly bodies: unknown[];
  };
  let clock: FakePolicyClock;

  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
    }
    if (webhook !== undefined) {
      await closeServer(webhook.server);
    }
    if (auditDir !== undefined) {
      await rm(auditDir, { force: true, recursive: true });
    }
  });

  it('dispatches once then records cooldown suppressions with no extra webhook posts', async () => {
    await startApp({
      ALERT_COOLDOWN_SEC: 60,
      ALERT_HOURLY_CAP: 10,
      ALERT_POLICY_ENABLED: 'true',
    });
    const baseUrl = await app.getUrl();

    const first = await postJson(
      new URL('/api.alerts/events', baseUrl),
      validFallPayload(),
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );
    clock.advanceMs(30_000);
    const second = await postJson(
      new URL('/api.alerts/events', baseUrl),
      validFallPayload(),
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );
    const third = await postJson(
      new URL('/api.alerts/events', baseUrl),
      validFallPayload(),
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );

    expectAccepted(first);
    expectAccepted(second);
    expectAccepted(third);
    expect(webhook.bodies).toHaveLength(1);

    const audits = await readAuditObjects(auditDir);
    expect(audits).toHaveLength(3);
    expect(audits[0]?.webhook_status).toBe(200);
    expect(audits[1]?.suppressed_reason).toBe('cooldown');
    expect(audits[2]?.suppressed_reason).toBe('cooldown');
    expect(audits[1]).not.toHaveProperty('forwarded_at');
    expect(audits[2]).not.toHaveProperty('webhook_status');
  });

  it('does not share cooldown between fall and detection-lost for the same source', async () => {
    await startApp({
      ALERT_COOLDOWN_SEC: 60,
      ALERT_HOURLY_CAP: 10,
      ALERT_POLICY_ENABLED: 'true',
    });
    const baseUrl = await app.getUrl();

    const fall = await postJson(
      new URL('/api.alerts/events', baseUrl),
      validFallPayload(),
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );
    const detectionLost = await postJson(
      new URL('/api.alerts/events', baseUrl),
      {
        ...validFallPayload(),
        type: AlertEventTypes.detectionLost,
        confidence: undefined,
      },
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );

    expectAccepted(fall);
    expectAccepted(detectionLost);
    expect(webhook.bodies).toHaveLength(2);

    const audits = await readAuditObjects(auditDir);
    expect(audits).toHaveLength(2);
    expect(audits.map((audit) => audit.type)).toEqual([
      AlertEventTypes.fall,
      AlertEventTypes.detectionLost,
    ]);
    expect(audits.every((audit) => audit.webhook_status === 200)).toBe(true);
  });

  it('does not allow concurrent valid posts to exceed the hourly cap', async () => {
    await startApp({
      ALERT_COOLDOWN_SEC: 0,
      ALERT_HOURLY_CAP: 10,
      ALERT_POLICY_ENABLED: 'true',
    });
    const baseUrl = await app.getUrl();
    const payloads = Array.from({ length: 20 }, (_unused, index) => ({
      ...validFallPayload(),
      source_id: `policy-cam-${index}`,
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
    expect(webhook.bodies).toHaveLength(10);

    const audits = await readAuditObjects(auditDir);
    expect(audits).toHaveLength(20);
    expect(audits.filter((audit) => audit.webhook_status === 200)).toHaveLength(
      10,
    );
    expect(
      audits.filter((audit) => audit.suppressed_reason === 'hourly_cap'),
    ).toHaveLength(10);
  });

  it('keeps invalid payloads out of audit and dispatch when policy is enabled', async () => {
    await startApp({
      ALERT_COOLDOWN_SEC: 60,
      ALERT_HOURLY_CAP: 10,
      ALERT_POLICY_ENABLED: 'true',
    });

    const response = await postJson(
      new URL('/api.alerts/events', await app.getUrl()),
      {
        ...validFallPayload(),
        type: 'unknown',
      },
      { apiKey: TEST_ALERT_EVENTS_API_KEY },
    );

    expect([400, 422]).toContain(response.statusCode);
    expect(webhook.bodies).toHaveLength(0);
    await expect(readAuditObjects(auditDir)).resolves.toEqual([]);
  });

  async function startApp(
    policyConfig: Readonly<Record<string, string | number>>,
  ): Promise<void> {
    auditDir = await mkdtemp(join(tmpdir(), 'alerts-policy-'));
    webhook = await startMockWebhook();
    clock = new FakePolicyClock();

    const testingModuleBuilder = Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [
            () => ({
              ALERT_CHANNEL: 'webhook',
              ALERT_EVENTS_API_KEY: TEST_ALERT_EVENTS_API_KEY,
              ALERT_VAR_DIR: auditDir,
              ALERT_WEBHOOK_URL: webhook.url,
              KAKAO_REDIRECT_URI: 'http://localhost:3000/auth/kakao/callback',
              KAKAO_REST_API_KEY: 'test-rest-key',
              ...policyConfig,
            }),
          ],
        }),
        AlertsModule,
      ],
    });
    const moduleRef = await testingModuleBuilder
      .overrideProvider(AlertPolicyClock)
      .useValue(clock)
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
  }
});

function validFallPayload() {
  return {
    type: AlertEventTypes.fall,
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

async function readAuditObjects(
  baseDir: string,
): Promise<readonly Record<string, unknown>[]> {
  try {
    const contents = await readFile(join(baseDir, 'audit.jsonl'), 'utf8');
    return contents
      .split('\n')
      .filter((line) => line.length > 0)
      .map((line) => parseJsonObject(line));
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

async function startMockWebhook() {
  const bodies: unknown[] = [];
  const server = createServer((req: IncomingMessage, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      bodies.push(parseJson(Buffer.concat(chunks).toString('utf8')));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
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

class FakePolicyClock extends AlertPolicyClock {
  private currentMs = Date.parse('2026-06-13T22:14:03.120Z');

  nowMs(): number {
    return this.currentMs;
  }

  advanceMs(milliseconds: number): void {
    this.currentMs += milliseconds;
  }
}

class InvalidTestResponseError extends Error {
  constructor(readonly field: string) {
    super(`Invalid test response field: ${field}`);
  }
}
