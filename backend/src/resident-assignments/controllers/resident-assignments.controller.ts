import {
  Controller,
  ForbiddenException,
  Get,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FacilityContextInterceptor } from '../../auth/facility-context.interceptor.js';
import {
  RequireFacilityGuard,
  SessionGuard,
  type RequestWithAuth,
} from '../../auth/session.guard.js';
import type { ResidentAssignmentQueryDto } from '../dto/resident-assignment-query.dto.js';
import { ResidentAssignmentsService } from '../services/resident-assignments.service.js';

@Controller({ path: 'resident-assignments', version: '1' })
@UseGuards(SessionGuard, RequireFacilityGuard)
@UseInterceptors(FacilityContextInterceptor)
export class ResidentAssignmentsController {
  constructor(private readonly service: ResidentAssignmentsService) {}

  @Get()
  list(
    @Req() req: RequestWithAuth,
    @Query() query: ResidentAssignmentQueryDto,
  ) {
    return this.service.list(requireFacilityId(req), {
      residentId: query.residentId,
      spaceId: query.spaceId,
      zoneId: query.zoneId,
      active: parseBoolean(query.active),
    });
  }
}

function requireFacilityId(req: RequestWithAuth): string {
  const facilityId = req.user?.facilityId;
  if (!facilityId) throw new ForbiddenException('Facility context required');
  return facilityId;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === 'true';
}
