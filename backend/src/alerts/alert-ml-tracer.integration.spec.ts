import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';

import { AlertsModule } from './alerts.module';
import { AlertPolicyClock } from './services/alert-policy.service';

const execFileAsync = promisify(execFile);
const SOURCE_ID = 'demo-ml-tracer';
const TEST_ALERT_EVENTS_API_KEY = 'test-alert-events-api-key';

let app: INestApplication | undefined;
let auditDir: string | undefined;
let webhook:
  | {
      readonly server: Server;
      readonly url: string;
      readonly bodies: unknown[];
    }
  | undefined;
let clock: FakePolicyClock;

describe('ML demo AlertClient to backend alert tracer', () => {
  afterEach(async () => {
    if (app !== undefined) {
      await app.close();
      app = undefined;
    }
    if (webhook !== undefined) {
      await closeServer(webhook.server);
      webhook = undefined;
    }
    if (auditDir !== undefined) {
      await rm(auditDir, { force: true, recursive: true });
      auditDir = undefined;
    }
  });

  it('sends fall and detection-lost from ML AlertClient to webhook and audit, then suppresses a cooldown repeat', async () => {
    await startApp({
      ALERT_COOLDOWN_SEC: 60,
      ALERT_HOURLY_CAP: 10,
      ALERT_POLICY_ENABLED: 'true',
    });

    const baseUrl = await requiredApp().getUrl();
    const firstRun = await runMlAlertClient(
      new URL('/api.alerts/events', baseUrl),
      [
        {
          event_type: 'fall',
          detected_at: '2026-06-13T22:14:03.120Z',
          confidence: 0.87,
        },
        {
          event_type: 'detection-lost',
          detected_at: '2026-06-13T22:14:04.120Z',
        },
      ],
    );

    expect(firstRun.accepted).toEqual([true, true]);
    expect(firstRun.failure_count).toBe(0);
    expect(firstRun.drop_count).toBe(0);
    expect(requiredWebhook().bodies).toHaveLength(2);

    const repeatedFall = await runMlAlertClient(
      new URL('/api.alerts/events', baseUrl),
      [
        {
          event_type: 'fall',
          detected_at: '2026-06-13T22:14:05.120Z',
          confidence: 0.91,
        },
      ],
    );

    expect(repeatedFall.accepted).toEqual([true]);
    expect(repeatedFall.failure_count).toBe(0);
    expect(repeatedFall.drop_count).toBe(0);
    expect(requiredWebhook().bodies).toHaveLength(2);

    const webhookBodies = requiredWebhook().bodies.map(parseJsonObject);
    expect(webhookBodies.map((body) => body.type)).toEqual([
      'fall',
      'detection-lost',
    ]);
    expect(webhookBodies.every((body) => body.source_id === SOURCE_ID)).toBe(
      true,
    );
    expect(
      webhookBodies.every((body) => typeof body.event_id === 'string'),
    ).toBe(true);

    const audits = await readAuditObjects(requiredAuditDir());
    expect(audits).toHaveLength(3);
    expect(audits.map((audit) => audit.type)).toEqual([
      'fall',
      'detection-lost',
      'fall',
    ]);
    expect(audits[0]?.webhook_status).toBe(200);
    expect(audits[1]?.webhook_status).toBe(200);
    expect(audits[2]?.suppressed_reason).toBe('cooldown');
    for (const audit of audits) {
      expect(typeof audit.event_id).toBe('string');
      expect(audit.source_id).toBe(SOURCE_ID);
      expect(typeof audit.detected_at).toBe('string');
      expect(typeof audit.received_at).toBe('string');
    }
  }, 20_000);

  it('keeps ML AlertClient sends nonblocking when backend is stopped', async () => {
    const run = await runMlAlertClient(
      new URL('http://127.0.0.1:9/api.alerts/events'),
      [
        {
          event_type: 'fall',
          detected_at: '2026-06-13T22:14:03.120Z',
          confidence: 0.87,
        },
      ],
    );

    expect(run.accepted).toEqual([true]);
    expect(run.send_elapsed_ms).toBeLessThan(50);
    expect(run.failure_count).toBe(1);
    expect(run.drop_count).toBe(0);
  }, 10_000);

  async function startApp(
    policyConfig: Readonly<Record<string, string | number>>,
  ): Promise<void> {
    auditDir = await mkdtemp(join(tmpdir(), 'alerts-ml-tracer-'));
    webhook = await startMockWebhook();
    clock = new FakePolicyClock();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          ignoreEnvFile: true,
          isGlobal: true,
          load: [
            () => ({
              ALERT_CHANNEL: 'webhook',
              ALERT_EVENTS_API_KEY: TEST_ALERT_EVENTS_API_KEY,
              ALERT_VAR_DIR: auditDir,
              ALERT_WEBHOOK_URL: requiredWebhook().url,
              KAKAO_REDIRECT_URI: 'http://localhost:3000/auth/kakao/callback',
              ...policyConfig,
            }),
          ],
        }),
        AlertsModule,
      ],
    })
      .overrideProvider(AlertPolicyClock)
      .useValue(clock)
      .compile();

    app = moduleRef.createNestApplication();
    await app.listen(0);
  }
});

type MlAlertEventInput = {
  readonly event_type: 'fall' | 'detection-lost';
  readonly detected_at: string;
  readonly confidence?: number;
};

type MlAlertClientRunDto = {
  readonly accepted: readonly boolean[];
  readonly drop_count: number;
  readonly failure_count: number;
  readonly pending_count: number;
  readonly send_elapsed_ms: number;
};

async function runMlAlertClient(
  apiUrl: URL,
  events: readonly MlAlertEventInput[],
): Promise<MlAlertClientRunDto> {
  const mlDir = resolve(process.cwd(), '..', 'ml');
  const script = `
import json
import sys
import time
from demo.alert_client import AlertClient

api_url = sys.argv[1]
source_id = sys.argv[2]
events = json.loads(sys.argv[3])
api_key = sys.argv[4]
client = AlertClient(api_url=api_url, source_id=source_id, timeout_sec=0.05, api_key=api_key)
accepted = []
start = time.perf_counter()
for event in events:
    accepted.append(client.send(
        event_type=event["event_type"],
        detected_at=event["detected_at"],
        confidence=event.get("confidence"),
    ))
send_elapsed_ms = (time.perf_counter() - start) * 1000
deadline = time.perf_counter() + 2.0
while client.pending_count > 0 and time.perf_counter() < deadline:
    time.sleep(0.005)
if client.pending_count > 0:
    raise SystemExit("alert client queue did not drain")
deadline = time.perf_counter() + 1.0
while any(accepted) and api_url.endswith(":9/api.alerts/events") and client.failure_count == 0 and time.perf_counter() < deadline:
    time.sleep(0.005)
result = {
    "accepted": accepted,
    "drop_count": client.drop_count,
    "failure_count": client.failure_count,
    "pending_count": client.pending_count,
    "send_elapsed_ms": send_elapsed_ms,
}
client.close()
print(json.dumps(result, sort_keys=True))
`;
  const { stdout } = await execFileAsync(
    'uv',
    [
      'run',
      '--directory',
      mlDir,
      'python',
      '-c',
      script,
      apiUrl.toString(),
      SOURCE_ID,
      JSON.stringify(events),
      TEST_ALERT_EVENTS_API_KEY,
    ],
    { timeout: 10_000 },
  );

  return parseMlRun(stdout);
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

function parseMlRun(input: string): MlAlertClientRunDto {
  const parsed = parseJsonObject(input);
  const accepted = Reflect.get(parsed, 'accepted');
  const dropCount = Reflect.get(parsed, 'drop_count');
  const failureCount = Reflect.get(parsed, 'failure_count');
  const pendingCount = Reflect.get(parsed, 'pending_count');
  const sendElapsedMs = Reflect.get(parsed, 'send_elapsed_ms');
  if (
    !Array.isArray(accepted) ||
    !accepted.every((value) => typeof value === 'boolean') ||
    typeof dropCount !== 'number' ||
    typeof failureCount !== 'number' ||
    typeof pendingCount !== 'number' ||
    typeof sendElapsedMs !== 'number'
  ) {
    throw new InvalidTestResponseError('ml-alert-client-run');
  }
  return {
    accepted,
    drop_count: dropCount,
    failure_count: failureCount,
    pending_count: pendingCount,
    send_elapsed_ms: sendElapsedMs,
  };
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
  const parsed = parseJson(input.trim());
  if (!isJsonRecord(parsed)) {
    throw new InvalidTestResponseError('json-object');
  }
  return parsed;
}

function isJsonRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
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

function requiredApp(): INestApplication {
  if (app === undefined) {
    throw new InvalidTestResponseError('app');
  }
  return app;
}

function requiredAuditDir(): string {
  if (auditDir === undefined) {
    throw new InvalidTestResponseError('audit-dir');
  }
  return auditDir;
}

function requiredWebhook(): {
  readonly server: Server;
  readonly url: string;
  readonly bodies: unknown[];
} {
  if (webhook === undefined) {
    throw new InvalidTestResponseError('webhook');
  }
  return webhook;
}

class FakePolicyClock extends AlertPolicyClock {
  private currentMs = Date.parse('2026-06-13T22:14:03.120Z');

  nowMs(): number {
    return this.currentMs;
  }
}

class InvalidTestResponseError extends Error {
  constructor(readonly field: string) {
    super(`Invalid test response field: ${field}`);
  }
}
