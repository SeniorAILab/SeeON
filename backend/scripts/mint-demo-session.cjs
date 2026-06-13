/* Dev-only: mint a seeded owner session cookie for the browser AC12 demo.
   Bypasses real Kakao login (seeded user); all other dashboard/SSE behaviour
   is exercised as in production. Not a CI/prod path. Requires built dist/. */
require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { PrismaClient } = require('@prisma/client');
const { AppModule } = require('../dist/src/app.module.js');
const { SessionService } = require('../dist/src/auth/session.service.js');

async function main() {
  const direct = new PrismaClient({
    datasources: { db: { url: process.env.DIRECT_URL } },
  });
  await direct.$connect();
  const targetOrgId = process.env.DEMO_ORG_ID || 'demo-org-01';
  const org =
    (await direct.organization.findUnique({ where: { id: targetOrgId } })) ||
    (await direct.organization.findFirst({ orderBy: { createdAt: 'asc' } }));
  if (!org) throw new Error('No organization — run seed first.');
  const resident = await direct.resident.findFirst({ where: { orgId: org.id } });

  const kakaoId = 'demo-browser-owner';
  const existing = await direct.user.findFirst({ where: { kakaoId } });
  const user = existing
    ? await direct.user.update({ where: { id: existing.id }, data: { orgId: org.id, role: 'OWNER' } })
    : await direct.user.create({ data: { kakaoId, nickname: 'Demo Owner', orgId: org.id, role: 'OWNER' } });
  await direct.$disconnect();

  const ctx = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const sessions = ctx.get(SessionService);
  const session = await sessions.createSession(user);
  await ctx.close();

  console.log(JSON.stringify({
    cookie: `app_session=${session.token}`,
    orgId: org.id,
    residentId: resident ? resident.id : null,
  }));
}

main().catch((err) => { console.error(err); process.exit(1); });
