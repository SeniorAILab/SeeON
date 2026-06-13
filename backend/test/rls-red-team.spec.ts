/**
 * RLS Red-Team Adversarial Tests — G001 Postgres RLS Default-Deny Multi-Tenancy
 *
 * PASS means the attack was BLOCKED. FAIL means a boundary was breached → BLOCKER.
 *
 * Each describe block creates a fresh PrismaClient to guarantee clean connections.
 * This is intentional: session-GUC contamination between tests IS itself a finding
 * (see Case 1 BLOCKER), so we must not carry it into other cases.
 *
 * Roles:
 *   - app  (fall_app): NOSUPERUSER NOBYPASSRLS — the target role under attack
 *   - root (fall):     superuser/migration role — setup/verify only, never the attacker
 *
 * Seed data (prisma/seed.ts):
 *   org-a → res-a (Resident A), res-c (Resident C)
 *   org-b → res-b (Resident B)
 */

import { PrismaClient } from '@prisma/client';

const APP_URL = requiredEnv('DATABASE_URL');
const ROOT_URL = requiredEnv('DIRECT_URL');

const ORG_A = 'org-a';
const ORG_B = 'org-b';
const RES_A = 'res-a'; // org-a
const RES_B = 'res-b'; // org-b
const RES_C = 'res-c'; // org-a, no ResidentStatus yet

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for RLS red-team tests`);
  }
  return value;
}

/** Create a fresh app-role client (fall_app, NOBYPASSRLS). */
function mkApp(): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: APP_URL } } });
}

/** Superuser client for setup/verify only. */
let root: PrismaClient;

beforeAll(async () => {
  root = new PrismaClient({ datasources: { db: { url: ROOT_URL } } });
  await root.$connect();

  await root.organization.upsert({
    where: { id: ORG_A },
    update: { name: 'Org A' },
    create: { id: ORG_A, name: 'Org A' },
  });
  await root.organization.upsert({
    where: { id: ORG_B },
    update: { name: 'Org B' },
    create: { id: ORG_B, name: 'Org B' },
  });
  await root.resident.upsert({
    where: { orgId_id: { orgId: ORG_A, id: RES_A } },
    update: { name: 'Resident A' },
    create: { id: RES_A, orgId: ORG_A, name: 'Resident A' },
  });
  await root.resident.upsert({
    where: { orgId_id: { orgId: ORG_B, id: RES_B } },
    update: { name: 'Resident B' },
    create: { id: RES_B, orgId: ORG_B, name: 'Resident B' },
  });
  await root.resident.upsert({
    where: { orgId_id: { orgId: ORG_A, id: RES_C } },
    update: { name: 'Resident C' },
    create: { id: RES_C, orgId: ORG_A, name: 'Resident C' },
  });
});

afterAll(async () => {
  await root.$disconnect();
});

// ─── Case 1: GUC leakage ─────────────────────────────────────────────────────
describe('Case 1 — GUC leakage: SET LOCAL vs session-scoped SET', () => {
  let app: PrismaClient;
  beforeAll(async () => {
    app = mkApp();
    await app.$connect();
  });
  afterAll(async () => {
    await app.$disconnect();
  });

  it('SET LOCAL app.org_id inside tx: sees org-A rows within tx', async () => {
    let countInTx = -1;
    await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "app.org_id" = '${ORG_A}'`);
      const rows = await tx.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*) AS c FROM "Resident"
      `;
      countInTx = Number(rows[0].c);
    });
    // org-a has 2 residents (res-a, res-c)
    expect(countInTx).toBe(2);
  });

  it('after tx commit (SET LOCAL): post-tx query sees 0 rows — GUC properly scoped', async () => {
    // Transaction A: set GUC locally
    await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "app.org_id" = '${ORG_A}'`);
      await tx.$queryRaw`SELECT 1`;
    });
    // After commit: same pool connection, GUC should be gone (SET LOCAL reverted)
    const rows = await app.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*) AS c FROM "Resident"
    `;
    // EXPECT 0 — if SET LOCAL is used correctly, GUC does not survive tx boundary.
    // If this fails (count > 0), the GUC leaked → BLOCKER.
    expect(Number(rows[0].c)).toBe(0);
  });

  /**
   * Session-scoped SET (without LOCAL) persists in a pooled connection.
   * This is why production code must use PrismaService.withOrgContext(), which
   * binds `SET LOCAL` inside a transaction, and must not hand-roll `SET`.
   */
  it('documents that session SET leaks until RESET, so code must use SET LOCAL only', async () => {
    const leakApp = mkApp();
    await leakApp.$connect();

    let postTxCount = -1;
    try {
      await leakApp.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET "app.org_id" = '${ORG_A}'`);
      });

      const rows = await leakApp.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*) AS c FROM "Resident"
      `;
      postTxCount = Number(rows[0].c);
      await leakApp.$executeRawUnsafe(`RESET "app.org_id"`);
    } finally {
      await leakApp.$disconnect();
    }

    expect(postTxCount).toBe(2);
  });
});

// ─── Case 2: raw SQL escape ───────────────────────────────────────────────────
describe('Case 2 — raw SQL escape: queries without GUC return 0 rows', () => {
  let app: PrismaClient;
  beforeAll(async () => {
    app = mkApp();
    await app.$connect();
  });
  afterAll(async () => {
    await app.$disconnect();
  });

  it('$queryRawUnsafe SELECT * → 0 rows (RLS blocks without GUC)', async () => {
    const rows = await app.$queryRawUnsafe<unknown[]>(
      'SELECT * FROM "Resident"',
    );
    expect(rows).toHaveLength(0);
  });

  it('$queryRawUnsafe WHERE 1=1 (tautology) → 0 rows', async () => {
    const rows = await app.$queryRawUnsafe<unknown[]>(
      `SELECT id, "orgId" FROM "Resident" WHERE 1=1`,
    );
    expect(rows).toHaveLength(0);
  });

  it('UNION ALL attack → 0 rows (RLS applied to both sides)', async () => {
    const rows = await app.$queryRawUnsafe<unknown[]>(
      `SELECT id FROM "Resident" WHERE id = 'x'
       UNION ALL
       SELECT id FROM "Resident"`,
    );
    expect(rows).toHaveLength(0);
  });

  it('subquery wrapping → 0 rows', async () => {
    const rows = await app.$queryRawUnsafe<unknown[]>(
      `SELECT * FROM (SELECT * FROM "Resident") sub`,
    );
    expect(rows).toHaveLength(0);
  });

  it('$queryRaw tagged-template → 0 rows', async () => {
    const rows = await app.$queryRaw<unknown[]>`SELECT * FROM "Resident"`;
    expect(rows).toHaveLength(0);
  });

  it('Alert without GUC → 0 rows', async () => {
    const rows = await app.$queryRawUnsafe<unknown[]>('SELECT * FROM "Alert"');
    expect(rows).toHaveLength(0);
  });

  it('Camera without GUC → 0 rows', async () => {
    const rows = await app.$queryRawUnsafe<unknown[]>('SELECT * FROM "Camera"');
    expect(rows).toHaveLength(0);
  });
});

// ─── Case 3: context-less access is fail-closed ───────────────────────────────
describe('Case 3 — context-less access: no data bleeds without GUC', () => {
  let app: PrismaClient;
  beforeAll(async () => {
    app = mkApp();
    await app.$connect();
  });
  afterAll(async () => {
    await app.$disconnect();
  });

  it('resident.findMany() → [] (RLS default-deny)', async () => {
    expect(await app.resident.findMany()).toHaveLength(0);
  });

  it('resident.findFirst() → null', async () => {
    expect(await app.resident.findFirst()).toBeNull();
  });

  it('resident.findUnique({id: res-a}) → null (no GUC bypass via direct ID lookup)', async () => {
    expect(await app.resident.findUnique({ where: { id: RES_A } })).toBeNull();
  });

  it('alert.findMany() → []', async () => {
    expect(await app.alert.findMany()).toHaveLength(0);
  });

  it('guardian.findMany() → []', async () => {
    expect(await app.guardian.findMany()).toHaveLength(0);
  });

  it('camera.findMany() → []', async () => {
    expect(await app.camera.findMany()).toHaveLength(0);
  });

  it('residentStatus.findMany() → []', async () => {
    expect(await app.residentStatus.findMany()).toHaveLength(0);
  });

  /**
   * NOTE (design observation): G001 RLS layer is fail-closed at the DB layer — 0 rows returned,
   * no cross-tenant bleed. The DB contract is satisfied. Application-layer enforcement
   * (throw on missing TenantContext, e.g. in prisma.service.ts withOrgContext middleware)
   * is a separate concern not yet implemented in G001.
   */
});

// ─── Case 4: cross-org write ─────────────────────────────────────────────────
describe('Case 4 — cross-org write: org-A GUC cannot mutate org-B rows', () => {
  let app: PrismaClient;
  beforeAll(async () => {
    app = mkApp();
    await app.$connect();
  });
  afterAll(async () => {
    await app.$disconnect();
  });

  it('UPDATE org-B resident in org-A context → 0 rows affected', async () => {
    const affected = await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "app.org_id" = '${ORG_A}'`);
      return tx.$executeRaw`
        UPDATE "Resident" SET name = 'HACKED' WHERE id = ${RES_B}
      `;
    });
    expect(Number(affected)).toBe(0);
    // Verify via root that data is intact
    const resident = await root.resident.findUnique({ where: { id: RES_B } });
    expect(resident?.name).toBe('Resident B');
  });

  it('DELETE org-B resident in org-A context → 0 rows affected', async () => {
    const affected = await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "app.org_id" = '${ORG_A}'`);
      return tx.$executeRaw`DELETE FROM "Resident" WHERE id = ${RES_B}`;
    });
    expect(Number(affected)).toBe(0);
    const resident = await root.resident.findUnique({ where: { id: RES_B } });
    expect(resident).not.toBeNull();
  });

  it('INSERT Resident with orgId=org-B while GUC=org-A → WITH CHECK violation', async () => {
    const testId = 'red-team-xorg-insert-001';
    await expect(
      app.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SET LOCAL "app.org_id" = '${ORG_A}'`);
        return tx.$executeRaw`
          INSERT INTO "Resident" (id, "orgId", name)
          VALUES (${testId}, ${ORG_B}, 'HACKED')
        `;
      }),
    ).rejects.toThrow(); // WITH CHECK policy rejects orgId != GUC
    // Cleanup guard
    await root.$executeRaw`DELETE FROM "Resident" WHERE id = ${testId}`;
  });

  it('findMany in org-A context returns only org-A rows (not org-B)', async () => {
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "app.org_id" = '${ORG_A}'`);
      return tx.resident.findMany();
    });
    const orgIds = [...new Set(rows.map((r) => r.orgId))];
    expect(orgIds).not.toContain(ORG_B);
    expect(orgIds.every((id) => id === ORG_A)).toBe(true);
  });
});

// ─── Case 5: FK desync ───────────────────────────────────────────────────────
describe('Case 5 — FK desync: cross-org child insert rejected by composite FK', () => {
  // Use superuser (root) to bypass RLS — we're testing FK constraints, not RLS here.

  afterEach(async () => {
    // Paranoid cleanup in case any test partially inserted data
    await root.$executeRaw`DELETE FROM "Guardian" WHERE id LIKE 'red-team-%'`;
    await root.$executeRaw`DELETE FROM "Camera" WHERE id LIKE 'red-team-%'`;
    await root.$executeRaw`DELETE FROM "ResidentStatus" WHERE id LIKE 'red-team-%'`;
  });

  it('Guardian(orgId=org-B, residentId=res-A) violates composite FK → rejected', async () => {
    // res-a belongs to org-a; Resident(org-b, res-a) doesn't exist → FK violation
    await expect(
      root.$executeRaw`
        INSERT INTO "Guardian" (id, "orgId", "residentId", name, phone)
        VALUES ('red-team-guardian-001', ${ORG_B}, ${RES_A}, 'BadGuardian', '010-0000-0000')
      `,
    ).rejects.toThrow(); // FK constraint violation (P2003 or equivalent)
  });

  it('Camera(orgId=org-B, residentId=res-A) violates composite FK → rejected', async () => {
    await expect(
      root.$executeRaw`
        INSERT INTO "Camera" (id, "orgId", "residentId", label, "ingestKeyId", "ingestSecretHash")
        VALUES ('red-team-camera-001', ${ORG_B}, ${RES_A}, 'bad-cam', 'kidxorg', 'hxorg')
      `,
    ).rejects.toThrow();
  });

  it('ResidentStatus(orgId=org-B, residentId=res-C) violates composite FK → rejected', async () => {
    // res-c belongs to org-a; inserting ResidentStatus(org-b, res-c) violates
    // composite FK since Resident(org-b, res-c) doesn't exist.
    // Using res-c (not res-a) because res-a already has ResidentStatus → unique constraint
    // would fire before FK. res-c has no existing status → FK constraint fires correctly.
    await expect(
      root.$executeRaw`
        INSERT INTO "ResidentStatus" (id, "residentId", "orgId", "updatedAt")
        VALUES ('red-team-status-001', ${RES_C}, ${ORG_B}, NOW())
      `,
    ).rejects.toThrow();
  });

  it('Alert(orgId=org-B, residentId=res-A) violates composite FK → rejected', async () => {
    await expect(
      root.$executeRaw`
        INSERT INTO "Alert" (
          id, "orgId", "residentId", type, probability,
          "detectedAt", "idempotencyKey"
        )
        VALUES (
          'red-team-alert-001', ${ORG_B}, ${RES_A},
          'fall', 0.9, NOW(), 'idem-red-team-001'
        )
      `,
    ).rejects.toThrow();
  });
});

// ─── Case 6: current_setting edge cases ──────────────────────────────────────
describe('Case 6 — current_setting edge cases: bad GUC → deny', () => {
  let app: PrismaClient;
  beforeAll(async () => {
    app = mkApp();
    await app.$connect();
  });
  afterAll(async () => {
    await app.$disconnect();
  });

  it('GUC = empty string → 0 rows', async () => {
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "app.org_id" = ''`);
      return tx.$queryRaw<
        { c: bigint }[]
      >`SELECT COUNT(*) AS c FROM "Resident"`;
    });
    expect(Number(rows[0].c)).toBe(0);
  });

  it('RESET app.org_id (no value) → 0 rows', async () => {
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`RESET "app.org_id"`);
      return tx.$queryRaw<
        { c: bigint }[]
      >`SELECT COUNT(*) AS c FROM "Resident"`;
    });
    expect(Number(rows[0].c)).toBe(0);
  });

  it('GUC = non-existent org → 0 rows', async () => {
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SET LOCAL "app.org_id" = 'no-such-org-99999'`,
      );
      return tx.$queryRaw<
        { c: bigint }[]
      >`SELECT COUNT(*) AS c FROM "Resident"`;
    });
    expect(Number(rows[0].c)).toBe(0);
  });

  it("GUC with SQL metachar ' OR '1'='1 is treated as a literal string → 0 rows", async () => {
    // RLS policy uses = (equality), not LIKE or dynamic SQL.
    // Metacharacters in GUC value cannot escape the comparison.
    const escaped = `' OR '1'='1`.replace(/'/g, "''");
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "app.org_id" = '${escaped}'`);
      return tx.$queryRaw<
        { c: bigint }[]
      >`SELECT COUNT(*) AS c FROM "Resident"`;
    });
    expect(Number(rows[0].c)).toBe(0);
  });

  it('GUC = % (wildcard) → 0 rows (policy uses =, not LIKE)', async () => {
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "app.org_id" = '%'`);
      return tx.$queryRaw<
        { c: bigint }[]
      >`SELECT COUNT(*) AS c FROM "Resident"`;
    });
    expect(Number(rows[0].c)).toBe(0);
  });

  it('positive control: GUC = org-A → sees exactly 2 org-A residents', async () => {
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "app.org_id" = '${ORG_A}'`);
      return tx.$queryRaw<
        { c: bigint }[]
      >`SELECT COUNT(*) AS c FROM "Resident"`;
    });
    expect(Number(rows[0].c)).toBe(2);
  });

  it('positive control: GUC = org-B → sees exactly 1 org-B resident', async () => {
    const rows = await app.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL "app.org_id" = '${ORG_B}'`);
      return tx.$queryRaw<
        { c: bigint }[]
      >`SELECT COUNT(*) AS c FROM "Resident"`;
    });
    expect(Number(rows[0].c)).toBe(1);
  });
});

// ─── Case 7: fall_app privilege audit ────────────────────────────────────────
describe('Case 7 — fall_app privilege audit: cannot alter RLS or DDL', () => {
  let app: PrismaClient;
  beforeAll(async () => {
    app = mkApp();
    await app.$connect();
  });
  afterAll(async () => {
    await app.$disconnect();
  });

  it('cannot DROP POLICY tenant_isolation', async () => {
    await expect(
      app.$executeRawUnsafe(`DROP POLICY tenant_isolation ON "Resident"`),
    ).rejects.toThrow();
  });

  it('cannot CREATE POLICY (open-all bypass attempt)', async () => {
    await expect(
      app.$executeRawUnsafe(
        `CREATE POLICY open_all ON "Resident" USING (true)`,
      ),
    ).rejects.toThrow();
  });

  it('cannot ALTER TABLE ... DISABLE ROW LEVEL SECURITY', async () => {
    await expect(
      app.$executeRawUnsafe(
        `ALTER TABLE "Resident" DISABLE ROW LEVEL SECURITY`,
      ),
    ).rejects.toThrow();
  });

  it('cannot ALTER TABLE ... NO FORCE ROW LEVEL SECURITY', async () => {
    await expect(
      app.$executeRawUnsafe(
        `ALTER TABLE "Resident" NO FORCE ROW LEVEL SECURITY`,
      ),
    ).rejects.toThrow();
  });

  it('cannot DROP TABLE', async () => {
    await expect(
      app.$executeRawUnsafe(`DROP TABLE "Resident"`),
    ).rejects.toThrow();
  });

  it('cannot TRUNCATE TABLE', async () => {
    await expect(
      app.$executeRawUnsafe(`TRUNCATE TABLE "Resident"`),
    ).rejects.toThrow();
  });

  it('cannot ALTER ROLE ... BYPASSRLS', async () => {
    await expect(
      app.$executeRawUnsafe(`ALTER ROLE fall_app BYPASSRLS`),
    ).rejects.toThrow();
  });

  it('cannot SET ROLE to superuser (impersonation)', async () => {
    await expect(app.$executeRawUnsafe(`SET ROLE fall`)).rejects.toThrow();
  });
});
