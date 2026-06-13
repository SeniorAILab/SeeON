-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('NEW', 'ACKED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ResidentState" AS ENUM ('NORMAL', 'WARNING', 'FALL');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessRegistrationNumber" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "kakaoId" TEXT NOT NULL,
    "email" TEXT,
    "nickname" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KakaoIdentity" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "kakaoId" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KakaoIdentity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orgId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServerSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resident" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "room" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Resident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guardian" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "relation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Camera" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "residentId" TEXT,
    "label" TEXT NOT NULL,
    "ingestKeyId" TEXT NOT NULL,
    "ingestSecretHash" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3),
    "online" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Camera_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "alertSeq" BIGSERIAL NOT NULL,
    "orgId" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "cameraId" TEXT,
    "type" TEXT NOT NULL,
    "probability" DOUBLE PRECISION NOT NULL,
    "snapshotKey" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'NEW',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResidentStatus" (
    "id" TEXT NOT NULL,
    "residentId" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "state" "ResidentState" NOT NULL DEFAULT 'NORMAL',
    "lastSeenAt" TIMESTAMP(3),
    "cameraOnline" BOOLEAN NOT NULL DEFAULT false,
    "sourceId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResidentStatus_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_kakaoId_key" ON "User"("kakaoId");

-- CreateIndex
CREATE UNIQUE INDEX "KakaoIdentity_userId_key" ON "KakaoIdentity"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Resident_orgId_id_key" ON "Resident"("orgId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Camera_orgId_id_key" ON "Camera"("orgId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Camera_orgId_label_key" ON "Camera"("orgId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "Camera_orgId_ingestKeyId_key" ON "Camera"("orgId", "ingestKeyId");

-- CreateIndex
CREATE INDEX "Alert_orgId_alertSeq_idx" ON "Alert"("orgId", "alertSeq");

-- CreateIndex
CREATE UNIQUE INDEX "Alert_orgId_idempotencyKey_key" ON "Alert"("orgId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "ResidentStatus_residentId_key" ON "ResidentStatus"("residentId");

-- CreateIndex
CREATE UNIQUE INDEX "ResidentStatus_orgId_residentId_key" ON "ResidentStatus"("orgId", "residentId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KakaoIdentity" ADD CONSTRAINT "KakaoIdentity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KakaoIdentity" ADD CONSTRAINT "KakaoIdentity_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerSession" ADD CONSTRAINT "ServerSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerSession" ADD CONSTRAINT "ServerSession_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resident" ADD CONSTRAINT "Resident_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guardian" ADD CONSTRAINT "Guardian_orgId_residentId_fkey" FOREIGN KEY ("orgId", "residentId") REFERENCES "Resident"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Camera" ADD CONSTRAINT "Camera_orgId_residentId_fkey" FOREIGN KEY ("orgId", "residentId") REFERENCES "Resident"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_orgId_residentId_fkey" FOREIGN KEY ("orgId", "residentId") REFERENCES "Resident"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_orgId_cameraId_fkey" FOREIGN KEY ("orgId", "cameraId") REFERENCES "Camera"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentStatus" ADD CONSTRAINT "ResidentStatus_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentStatus" ADD CONSTRAINT "ResidentStatus_orgId_residentId_fkey" FOREIGN KEY ("orgId", "residentId") REFERENCES "Resident"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResidentStatus" ADD CONSTRAINT "ResidentStatus_orgId_sourceId_fkey" FOREIGN KEY ("orgId", "sourceId") REFERENCES "Camera"("orgId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── RLS: Enable + Force on all tenant tables (ADR-A / NR1) ─────────────────
-- FORCE ROW LEVEL SECURITY means even the table owner (superuser) is subject
-- to the policy — the NOSUPERUSER NOBYPASSRLS app role sees only its org's rows.

ALTER TABLE "Resident" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Resident" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Guardian" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Guardian" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Camera" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Camera" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Alert" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Alert" FORCE ROW LEVEL SECURITY;

ALTER TABLE "ResidentStatus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ResidentStatus" FORCE ROW LEVEL SECURITY;

ALTER TABLE "KakaoIdentity" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "KakaoIdentity" FORCE ROW LEVEL SECURITY;

-- ─── Default-deny RLS policies ───────────────────────────────────────────────
-- USING:      filters rows returned by SELECT / UPDATE / DELETE.
-- WITH CHECK: filters rows inserted / updated (rejects writes to wrong org).
-- When app.org_id GUC is absent or empty, current_setting returns '' which
-- never matches any org_id — all rows are denied (default-deny).

CREATE POLICY tenant_isolation ON "Resident"
  USING     ("orgId" = current_setting('app.org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON "Guardian"
  USING     ("orgId" = current_setting('app.org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON "Camera"
  USING     ("orgId" = current_setting('app.org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON "Alert"
  USING     ("orgId" = current_setting('app.org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON "ResidentStatus"
  USING     ("orgId" = current_setting('app.org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.org_id', true)::text);

CREATE POLICY tenant_isolation ON "KakaoIdentity"
  USING     ("orgId" = current_setting('app.org_id', true)::text)
  WITH CHECK ("orgId" = current_setting('app.org_id', true)::text);

-- ─── Grant privileges to NOSUPERUSER app role (NR1) ──────────────────────────
-- All application DML goes through the fall_app role.
-- Sequence grants are required for BIGSERIAL (alertSeq) auto-increment.

GRANT USAGE ON SCHEMA public TO fall_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fall_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fall_app;
