import type { PrismaService } from '../prisma/prisma.service';

export async function nextFacilityCode(
  prisma: PrismaService,
  name: string,
): Promise<string> {
  const base = slugFacilityName(name);
  const existing = await prisma.db.facility.findMany({
    where: { code: { startsWith: base } },
    select: { code: true },
  });
  const used = new Set(existing.map((facility) => facility.code));
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

function slugFacilityName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'facility'
  );
}
