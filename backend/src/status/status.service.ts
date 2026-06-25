import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

const CAMERA_ONLINE_TIMEOUT_MS = 30_000;

@Injectable()
export class StatusService {
  constructor(private readonly prisma: PrismaService) {}

  async listByFacility(facilityId: string) {
    const statuses = await this.prisma.withFacilityContext(
      facilityId,
      (tx: Prisma.TransactionClient) =>
        tx.residentStatus.findMany({
          include: { resident: { select: { name: true } } },
        }),
    );
    return statuses.map((s) => this._decayOnline(s));
  }

  async getByResident(facilityId: string, residentId: string) {
    const s = await this.prisma.withFacilityContext(
      facilityId,
      (tx: Prisma.TransactionClient) =>
        tx.residentStatus.findUnique({
          where: { residentId },
          include: { resident: { select: { name: true } } },
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
  /**
   * Upsert ResidentStatus.cameraOnline = true for the resident assigned to
   * the heartbeating camera. Called from the ingest heartbeat endpoint (F6).
   * The 30s decay still applies on read via _decayOnline.
   */
  async recordCameraHeartbeat(
    facilityId: string,
    cameraId: string,
    residentId: string | null,
  ): Promise<void> {
    if (!residentId) return; // camera not assigned to a resident
    const now = new Date();
    await this.prisma.withFacilityContext(
      facilityId,
      (tx: Prisma.TransactionClient) =>
        tx.residentStatus.upsert({
          where: { residentId },
          create: {
            facilityId,
            residentId,
            cameraOnline: true,
            lastSeenAt: now,
            sourceId: cameraId,
          },
          update: {
            cameraOnline: true,
            lastSeenAt: now,
            sourceId: cameraId,
          },
        }),
    );
  }
}
