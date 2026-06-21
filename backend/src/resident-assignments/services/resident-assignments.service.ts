import { Injectable } from '@nestjs/common';
import type { ResidentAssignment } from '@prisma/client';
import { ResidentAssignmentsRepository } from '../repositories/resident-assignments.repository.js';

@Injectable()
export class ResidentAssignmentsService {
  constructor(private readonly assignments: ResidentAssignmentsRepository) {}

  async list(
    facilityId: string,
    filters: {
      residentId?: string;
      spaceId?: string;
      zoneId?: string;
      active?: boolean;
    },
  ) {
    return (await this.assignments.list(facilityId, filters)).map(
      presentAssignment,
    );
  }
}

export function presentAssignment(assignment: ResidentAssignment) {
  return {
    id: assignment.id,
    facilityId: assignment.facilityId,
    residentId: assignment.residentId,
    spaceId: assignment.spaceId,
    zoneId: assignment.zoneId,
    active: assignment.endedAt === null,
    startedAt: assignment.startedAt.toISOString(),
    endedAt: assignment.endedAt?.toISOString() ?? null,
  };
}
