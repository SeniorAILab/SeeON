/* Dev-only: mint a seeded owner session cookie for the browser AC12 demo.
   Bypasses real Kakao login (seeded user); all other dashboard/SSE behaviour
   is exercised as in production. Requires ALLOW_DEMO_SESSION_MINT=1,
   refuses production, and never falls back to a non-demo org/resident. */
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { PrismaClient } = require('@prisma/client');
const { AppModule } = require('../dist/src/app.module.js');
const { SessionService } = require('../dist/src/auth/session.service.js');

async function main() {
  if (process.env.ALLOW_DEMO_SESSION_MINT !== '1') {
    throw new Error(
      'Refusing to mint demo session without ALLOW_DEMO_SESSION_MINT=1.',
    );
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to mint demo session while NODE_ENV=production.');
  }
  const direct = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL } },
  });
  await direct.$connect();
  const targetOrgId = process.env.DEMO_ORG_ID || 'demo-org-01';
  const org = await direct.organization.findUnique({ where: { id: targetOrgId } });
  if (!org) {
    throw new Error(`Demo organization ${targetOrgId} not found — run seed first.`);
  }
  const targetResidentId = process.env.DEMO_RESIDENT_ID || 'demo-res-01';
  const resident = await direct.resident.findUnique({
    where: { orgId_id: { orgId: org.id, id: targetResidentId } },
  });
  if (!resident) {
    throw new Error(
      `Demo resident ${targetResidentId} not found in ${targetOrgId} — run seed first.`,
    );
  }

  const kakaoId = 'demo-browser-owner';
  const existing = await direct.user.findFirst({ where: { kakaoId } });
  const user = existing
    ? await direct.user.update({
        where: { id: existing.id },
        data: { orgId: org.id, role: 'OWNER' },
      })
    : await direct.user.create({
        data: { kakaoId, nickname: 'Demo Owner', orgId: org.id, role: 'OWNER' },
      });
  await direct.$disconnect();

  const ctx = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const sessions = ctx.get(SessionService);
  const session = await sessions.createSession(user);
  await ctx.close();

  console.log(JSON.stringify({
    cookie: `app_session=${session.token}`,
    orgId: org.id,
    residentId: resident.id,
  }));
}

main().catch((err) => { console.error(err); process.exit(1); });
