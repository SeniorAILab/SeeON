import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateResidentDto {
  name: string;
  room?: string;
}

export interface UpdateResidentDto {
  name?: string;
  room?: string;
}

@Injectable()
export class ResidentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(orgId: string) {
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.resident.findMany({ orderBy: { createdAt: 'asc' } }),
    );
  }

  async getOne(orgId: string, id: string) {
    const resident = await this.prisma.withOrgContext(
      orgId,
      (tx: Prisma.TransactionClient) =>
        tx.resident.findUnique({
          where: { id },
          include: { residentStatus: true, guardians: true, cameras: true },
        }),
    );
    if (!resident) throw new NotFoundException('Resident not found');
    return resident;
  }

  async create(orgId: string, dto: CreateResidentDto) {
    if (!dto.name?.trim()) throw new ConflictException('name is required');
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.resident.create({
        data: { orgId, name: dto.name.trim(), room: dto.room?.trim() ?? null },
      }),
    );
  }

  async update(orgId: string, id: string, dto: UpdateResidentDto) {
    const existing = await this.prisma.withOrgContext(
      orgId,
      (tx: Prisma.TransactionClient) =>
        tx.resident.findUnique({ where: { id } }),
    );
    if (!existing) throw new NotFoundException('Resident not found');
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new ConflictException('name is required');
    }
    return this.prisma.withOrgContext(orgId, (tx: Prisma.TransactionClient) =>
      tx.resident.update({
        where: { id },
        data: {
          name: dto.name?.trim() ?? undefined,
          room: dto.room !== undefined ? (dto.room?.trim() ?? null) : undefined,
        },
      }),
    );
  }

  async remove(orgId: string, id: string) {
    const existing = await this.prisma.withOrgContext(
      orgId,
      (tx: Prisma.TransactionClient) =>
        tx.resident.findUnique({ where: { id } }),
    );
    if (!existing) throw new NotFoundException('Resident not found');
    try {
      return await this.prisma.withOrgContext(
        orgId,
        (tx: Prisma.TransactionClient) => tx.resident.delete({ where: { id } }),
      );
    } catch {
      throw new ConflictException(
        'Resident cannot be deleted while guardians, cameras, alerts, or status rows reference it',
      );
    }
  }
}
