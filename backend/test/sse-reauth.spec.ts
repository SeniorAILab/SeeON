/**
 * SSE re-auth tick (F6/AC4) integration tests.
 *
 * Verifies that an open SSE stream is closed when the backing ServerSession is
 * revoked — i.e. the periodic re-auth tick detects the invalidation and ends
 * the response.
 *
 * SSE_REAUTH_INTERVAL_MS is overridden to 200 ms so the tick fires quickly
 * in tests without relying on real-timer waits or jest fake timers.
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as http from 'http';
import type { AddressInfo } from 'net';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { KakaoClient } from '../src/auth/kakao.client';
import { SessionService } from '../src/auth/session.service';
import { SSE_REAUTH_INTERVAL_MS } from '../src/dashboard/sse.controller';

const REAUTH_MS = 200;

let app: INestApplication<App>;
let direct: PrismaClient;
let sessions: SessionService;
let sessionCookie: string;
let sessionId: string;
const ORG = `sse-reauth-org-${Date.now()}`;

beforeAll(async () => {
  process.env.SESSION_JWT_SECRET = 'test-session-secret-minimum-32-characters';
  process.env.KAKAO_REST_API_KEY = 'test-kakao-key';
  process.env.KAKAO_REDIRECT_URI = 'http://localhost:3001/auth/kakao/callback';

  direct = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL } },
  });
  await direct.$connect();

  await direct.organization.create({
    data: { id: ORG, name: 'SSE Reauth Test Org' },
  });
  const user = await direct.user.create({
    data: {
      kakaoId: `sse-reauth-user-${Date.now()}`,
      nickname: 'SSE Reauth Test',
      orgId: ORG,
    },
  });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(KakaoClient)
    .useValue({
      buildAuthorizeUrl: () => '/',
      exchangeCode: jest.fn(),
      getProfile: jest.fn(),
    })
    .overrideProvider(SSE_REAUTH_INTERVAL_MS)
    .useValue(REAUTH_MS)
    .compile();

  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  // Bind to a random port for raw HTTP connections.
  await app.listen(0);

  sessions = app.get(SessionService);
  const created = await sessions.createSession(user);
  sessionCookie = `app_session=${created.token}`;
  sessionId = created.session.id;
}, 30_000);

afterAll(async () => {
  await direct.serverSession.deleteMany({ where: { orgId: ORG } });
  await direct.user.deleteMany({ where: { orgId: ORG } });
  await direct.organization.delete({ where: { id: ORG } }).catch(() => {});
  await app.close();
  await direct.$disconnect();
});

function getPort(): number {
  const server = app.getHttpServer() as {
    address: () => AddressInfo | string | null;
  };
  const addr = server.address();
  if (!addr || typeof addr === 'string')
    throw new Error('Server not listening');
  return addr.port;
}

describe('SSE re-auth tick (F6/AC4)', () => {
  it('session.checkActive returns false after revoke', async () => {
    const user = await direct.user.create({
      data: {
        kakaoId: `sse-reauth-check-${Date.now()}`,
        nickname: 'CheckUser',
        orgId: ORG,
      },
    });
    const { session } = await sessions.createSession(user);
    const before = await sessions.checkActive(session.id, user.sessionVersion);
    expect(before).toBe(true);

    await sessions.revoke(session.id);
    const after = await sessions.checkActive(session.id, user.sessionVersion);
    expect(after).toBe(false);

    await direct.serverSession.deleteMany({ where: { userId: user.id } });
    await direct.user.delete({ where: { id: user.id } });
  });

  it('closes SSE stream when session is revoked (tick fires within REAUTH_MS)', async () => {
    const port = getPort();
    let streamEnded = false;

    await new Promise<void>((resolve, reject) => {
      const deadline = setTimeout(
        () =>
          reject(
            new Error('Timeout: stream did not close after session revoke'),
          ),
        // Wait 4× the tick interval plus connection setup margin.
        REAUTH_MS * 6 + 500,
      );

      const req = http.get(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/sse',
          headers: { cookie: sessionCookie },
        },
        (res) => {
          res.resume(); // drain to prevent back-pressure
          res.once('end', () => {
            streamEnded = true;
            clearTimeout(deadline);
            resolve();
          });
          res.once('error', () => {
            // Connection reset also counts as closed.
            streamEnded = true;
            clearTimeout(deadline);
            resolve();
          });

          // Revoke the session after connection is established.
          setTimeout(() => {
            void sessions.revoke(sessionId).catch((e: unknown) => {
              clearTimeout(deadline);
              reject(e instanceof Error ? e : new Error(String(e)));
            });
          }, 50);
        },
      );

      req.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNRESET') {
          streamEnded = true;
          clearTimeout(deadline);
          resolve();
          return;
        }
        clearTimeout(deadline);
        reject(err);
      });
    });

    expect(streamEnded).toBe(true);
  }, 10_000);
});
