import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { KakaoClient } from '../src/auth/kakao.client';
import { createSignedSessionToken } from '../src/auth/signed-token';

const TEST_SECRET = 'test-session-secret-minimum-32-characters';

type AuthResponseBody = {
  user: {
    id: string;
    kakaoId: string;
    sessionVersion: number;
    orgId: string | null;
    role?: string;
  };
};

type OrgProbeBody = {
  orgId: string | null;
};

describe('Kakao auth/session tenant boundary (e2e)', () => {
  let app: INestApplication<App>;
  let direct: PrismaClient;

  beforeAll(async () => {
    process.env.SESSION_JWT_SECRET = TEST_SECRET;
    process.env.KAKAO_REST_API_KEY = 'test-rest-api-key';
    process.env.KAKAO_REDIRECT_URI =
      'http://localhost:3001/auth/kakao/callback';

    direct = new PrismaClient({
      datasources: { db: { url: process.env.DIRECT_URL } },
    });
    await direct.$connect();
  });

  beforeEach(async () => {
    await direct.kakaoIdentity.deleteMany();
    await direct.serverSession.deleteMany();
    await direct.user.deleteMany({ where: { kakaoId: 'kakao-e2e-user' } });
    await direct.organization.deleteMany({ where: { name: 'E2E Facility' } });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KakaoClient)
      .useValue({
        buildAuthorizeUrl: (state: string) =>
          `https://kauth.kakao.test/oauth?state=${state}`,
        exchangeCode: jest.fn().mockResolvedValue({
          access_token: 'test-access-token',
          expires_in: 3600,
        }),
        getProfile: jest.fn().mockResolvedValue({
          kakaoId: 'kakao-e2e-user',
          email: 'owner@example.test',
          nickname: '시설 원장',
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await direct.$disconnect();
  });

  it('rejects unauthenticated protected requests with 401', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer()).get('/api/protected-probe').expect(401);
  });

  it('round-trips Kakao login, creates owner org during onboarding, and revokes session on logout', async () => {
    const login = await request(app.getHttpServer())
      .get('/auth/kakao/login')
      .expect(302);
    const stateCookie = login.headers['set-cookie'][0];
    const state = /kakao_oauth_state=([^;]+)/.exec(stateCookie)?.[1];
    expect(state).toBeTruthy();
    expect(login.headers.location).toBe(
      `https://kauth.kakao.test/oauth?state=${state}`,
    );

    const callback = await request(app.getHttpServer())
      .get(`/auth/kakao/callback?code=test-code&state=${state}`)
      .set('cookie', stateCookie)
      .expect(302);
    const firstSessionCookie = extractSessionCookie(
      callback.headers['set-cookie'],
    );
    expect(callback.headers.location).toBe('/onboarding');
    expect(firstSessionCookie).toContain('HttpOnly');
    expect(firstSessionCookie).toContain('SameSite=Lax');

    const meBeforeOrg = await request(app.getHttpServer())
      .get('/auth/me')
      .set('cookie', firstSessionCookie)
      .expect(200);
    expect(
      (meBeforeOrg.body as unknown as AuthResponseBody).user.orgId,
    ).toBeNull();

    await request(app.getHttpServer())
      .get('/api/org-protected-probe')
      .set('cookie', firstSessionCookie)
      .expect(403);

    const orgCreate = await request(app.getHttpServer())
      .post('/orgs')
      .set('cookie', firstSessionCookie)
      .send({
        facilityName: 'E2E Facility',
        businessRegistrationNumber: '123-45-67890',
      })
      .expect(201);
    const orgSessionCookie = extractSessionCookie(
      orgCreate.headers['set-cookie'],
    );
    const orgCreateBody = orgCreate.body as unknown as AuthResponseBody;
    expect(orgCreateBody.user.orgId).toBeTruthy();
    expect(orgCreateBody.user.role).toBe('OWNER');

    const orgProbe = await request(app.getHttpServer())
      .get('/api/org-protected-probe')
      .set('cookie', orgSessionCookie)
      .expect(200);
    expect((orgProbe.body as unknown as OrgProbeBody).orgId).toBe(
      orgCreateBody.user.orgId,
    );

    const activeSession = await direct.serverSession.findFirstOrThrow({
      where: { userId: orgCreateBody.user.id, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    const nowSeconds = Math.floor(Date.now() / 1000);
    const oldToken = createSignedSessionToken(
      {
        sessionId: activeSession.id,
        userId: orgCreateBody.user.id,
        orgId: orgCreateBody.user.orgId,
        sessionVersion: orgCreateBody.user.sessionVersion,
        iat: nowSeconds - 700,
        exp: nowSeconds + 1800,
      },
      TEST_SECRET,
    );
    const rotated = await request(app.getHttpServer())
      .get('/auth/me')
      .set('cookie', `app_session=${oldToken}`)
      .expect(200);
    const rotatedCookie = extractSessionCookie(rotated.headers['set-cookie']);
    expect(rotatedCookie).not.toContain(oldToken);
    await expect(
      direct.serverSession.findUniqueOrThrow({
        where: { id: activeSession.id },
      }),
    ).resolves.toMatchObject({ revokedAt: expect.any(Date) as Date });

    await request(app.getHttpServer())
      .get('/sse')
      .set('cookie', rotatedCookie)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('cookie', rotatedCookie)
      .expect(204);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('cookie', rotatedCookie)
      .expect(401);

    await request(app.getHttpServer())
      .get('/sse')
      .set('cookie', rotatedCookie)
      .expect(401);
  });

  it('rejects callback requests with missing or mismatched OAuth state', async () => {
    await request(app.getHttpServer())
      .get('/auth/kakao/callback?code=test-code&state=bad')
      .expect(400);
  });
});

function extractSessionCookie(
  setCookie: string[] | string | undefined,
): string {
  const values = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  const cookie = values.find((value) => value.startsWith('app_session='));
  if (!cookie) throw new Error('app_session cookie missing');
  return cookie;
}
