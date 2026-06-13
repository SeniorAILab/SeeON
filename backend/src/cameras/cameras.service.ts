import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateCameraDto {
  label: string;
  residentId?: string;
}

export interface UpdateCameraDto {
  label?: string;
  residentId?: string;
}

@Injectable()
export class CamerasService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string) {
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.camera.findMany({ orderBy: { createdAt: 'asc' } }),
    );
  }

  async getOne(orgId: string, id: string) {
    const cam = await this.prisma.withOrgContext(
      orgId,
      (tx: Prisma.TransactionClient) => tx.camera.findUnique({ where: { id } }),
    );
    if (!cam) throw new NotFoundException('Camera not found');
    return cam;
  }

  async create(orgId: string, dto: CreateCameraDto) {
    const ingestKeyId = `cam-${crypto.randomBytes(8).toString('hex')}`;
    // The HMAC secret — stored in full as the HMAC key (ingestSecretHash field).
    const ingestSecretHash = crypto.randomBytes(32).toString('hex');
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.camera.create({
        data: {
          orgId,
          label: dto.label,
          residentId: dto.residentId ?? null,
          ingestKeyId,
          ingestSecretHash,
        },
      }),
    );
  }

  async update(orgId: string, id: string, dto: UpdateCameraDto) {
    const existing = await this.prisma.withOrgContext(
      orgId,
      (tx: Prisma.TransactionClient) => tx.camera.findUnique({ where: { id } }),
    );
    if (!existing) throw new NotFoundException('Camera not found');
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.camera.update({
        where: { id },
        data: {
          label: dto.label,
          residentId: dto.residentId,
        },
      }),
    );
  }

  async recordHeartbeat(orgId: string, cameraId: string) {
    const now = new Date();
    await this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.camera.update({
        where: { id: cameraId },
        data: { lastSeenAt: now, online: true },
      }),
    );
  }
}
