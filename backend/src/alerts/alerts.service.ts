import { Injectable, NotFoundException } from '@nestjs/common';
import { AlertStatus } from '@prisma/client';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { OrgScopedNotFoundException } from '../common/domain-errors.js';

export interface AlertQuery {
  residentId?: string;
  status?: AlertStatus;
  afterSeq?: bigint;
  limit?: number;
}

@Injectable()
export class AlertsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string, query: AlertQuery = {}) {
    const { residentId, status, afterSeq, limit = 50 } = query;
    const take = Math.min(limit, 200);
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.alert.findMany({
        where: {
          residentId: residentId ?? undefined,
          status: status ?? undefined,
          alertSeq: afterSeq !== undefined ? { gt: afterSeq } : undefined,
        },
        orderBy: { alertSeq: 'desc' },
        take,
        include: { resident: { select: { name: true, room: true } } },
      }),
    );
  }

  async getOne(orgId: string, id: string) {
    const alert = await this.prisma.withOrgContext(
      orgId,
      (tx: Prisma.TransactionClient) =>
        tx.alert.findUnique({
          where: { id },
          include: { resident: { select: { name: true, room: true } } },
        }),
    );
    if (!alert) throw new OrgScopedNotFoundException('alert');
    return alert;
  }

  async ack(orgId: string, id: string) {
    const existing = await this.prisma.withOrgContext(
      orgId,
      (tx: Prisma.TransactionClient) => tx.alert.findUnique({ where: { id } }),
    );
    if (!existing) throw new NotFoundException('Alert not found');
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.alert.update({ where: { id }, data: { status: AlertStatus.ACKED } }),
    );
  }

  async setSnapshotKey(orgId: string, id: string, snapshotKey: string) {
    const existing = await this.prisma.withOrgContext(
      orgId,
      (tx: Prisma.TransactionClient) => tx.alert.findUnique({ where: { id } }),
    );
    if (!existing) throw new OrgScopedNotFoundException('alert');
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.alert.update({ where: { id }, data: { snapshotKey } }),
    );
  }

  async replay(orgId: string, afterSeq: bigint) {
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.alert.findMany({
        where: { alertSeq: { gt: afterSeq } },
        orderBy: { alertSeq: 'asc' },
      }),
    );
  }
}
