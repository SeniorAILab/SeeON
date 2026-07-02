import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RequireFacilityGuard, SessionGuard } from '../auth/session.guard.js';
import { FacilityContextInterceptor } from '../auth/facility-context.interceptor.js';
import type { RequestWithAuth } from '../auth/session.guard.js';
import { StatusService } from './status.service.js';

@Controller({ path: 'status', version: '1' })
@UseGuards(SessionGuard, RequireFacilityGuard)
@UseInterceptors(FacilityContextInterceptor)
export class StatusController {
  constructor(private readonly service: StatusService) {}

  @Get()
  listAll(@Req() req: RequestWithAuth) {
    return this.service.listByFacility(requireFacilityId(req));
  }

  @Get(':residentId')
  getByResident(
    @Req() req: RequestWithAuth,
    @Param('residentId') residentId: string,
  ) {
    return this.service.getByResident(requireFacilityId(req), residentId);
  }
}

function requireFacilityId(req: RequestWithAuth): string {
  const facilityId = req.effectiveFacilityId ?? req.user?.facilityId;
  if (!facilityId) throw new ForbiddenException('Facility context required');
  return facilityId;
}
