import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const CAMERA_ONLINE_TIMEOUT_MS = 30_000;

@Injectable()
export class StatusService {
  constructor(private readonly prisma: PrismaService) {}

  async listByOrg(orgId: string) {
    const statuses = await this.prisma.withOrgContext(
      orgId,
      (tx: Prisma.TransactionClient) =>
        tx.residentStatus.findMany({
          include: { resident: { select: { name: true, room: true } } },
        }),
    );
    return statuses.map((s) => this._decayOnline(s));
  }

  async getByResident(orgId: string, residentId: string) {
    const s = await this.prisma.withOrgContext(
      orgId,
      (tx: Prisma.TransactionClient) =>
        tx.residentStatus.findUnique({
          where: { residentId },
          include: { resident: { select: { name: true, room: true } } },
        }),
    );
    if (!s) return null;
    return this._decayOnline(s);
  }

  /** cameraOnline decays if lastSeenAt is older than 30 s. */
  private _decayOnline<
    T extends { cameraOnline: boolean; lastSeenAt: Date | null },
  >(s: T): T {
    if (s.cameraOnline && s.lastSeenAt) {
      const age = Date.now() - s.lastSeenAt.getTime();
      if (age >= CAMERA_ONLINE_TIMEOUT_MS) {
        return { ...s, cameraOnline: false };
      }
    }
    return s;
  }
}
