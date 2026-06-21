import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

export interface CreateGuardianDto {
  residentId: string;
  name: string;
  phone: string;
  relation?: string;
}

export interface UpdateGuardianDto {
  name?: string;
  phone?: string;
  relation?: string | null;
}

@Injectable()
export class GuardiansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(facilityId: string, residentId?: string) {
    return this.prisma.withFacilityContext(
      facilityId,
      (tx: Prisma.TransactionClient) =>
        tx.guardian.findMany({
          where: residentId ? { residentId } : undefined,
          orderBy: { createdAt: 'asc' },
        }),
    );
  }

  async getOne(facilityId: string, id: string) {
    const g = await this.prisma.withFacilityContext(
      facilityId,
      (tx: Prisma.TransactionClient) =>
        tx.guardian.findUnique({ where: { id } }),
    );
    if (!g) throw new NotFoundException('Guardian not found');
    return g;
  }

  async create(facilityId: string, dto: CreateGuardianDto) {
    if (!dto.residentId || !dto.name.trim() || !dto.phone.trim()) {
      throw new ConflictException('residentId, name, and phone are required');
    }
    return this.prisma.withFacilityContext(
      facilityId,
      (tx: Prisma.TransactionClient) =>
        tx.guardian.create({
          data: {
            facilityId,
            residentId: dto.residentId,
            name: dto.name.trim(),
            phone: dto.phone.trim(),
            relation: dto.relation?.trim() || null,
          },
        }),
    );
  }

  async update(facilityId: string, id: string, dto: UpdateGuardianDto) {
    const existing = await this.prisma.withFacilityContext(
      facilityId,
      (tx: Prisma.TransactionClient) =>
        tx.guardian.findUnique({ where: { id } }),
    );
    if (!existing) throw new NotFoundException('Guardian not found');
    if (dto.name !== undefined && !dto.name.trim()) {
      throw new ConflictException('name is required');
    }
    if (dto.phone !== undefined && !dto.phone.trim()) {
      throw new ConflictException('phone is required');
    }
    return this.prisma.withFacilityContext(
      facilityId,
      (tx: Prisma.TransactionClient) =>
        tx.guardian.update({
          where: { id },
          data: {
            name: dto.name?.trim(),
            phone: dto.phone?.trim(),
            relation:
              dto.relation !== undefined
                ? dto.relation?.trim() || null
                : undefined,
          },
        }),
    );
  }

  async remove(facilityId: string, id: string) {
    const existing = await this.prisma.withFacilityContext(
      facilityId,
      (tx: Prisma.TransactionClient) =>
        tx.guardian.findUnique({ where: { id } }),
    );
    if (!existing) throw new NotFoundException('Guardian not found');
    return this.prisma.withFacilityContext(
      facilityId,
      (tx: Prisma.TransactionClient) => tx.guardian.delete({ where: { id } }),
    );
  }
}
