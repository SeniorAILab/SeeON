import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RequireOrgGuard, SessionGuard } from '../auth/session.guard.js';
import { OrgContextInterceptor } from '../auth/org-context.interceptor.js';
import type { RequestWithAuth } from '../auth/session.guard.js';
import { StatusService } from './status.service.js';

@Controller('api/status')
@UseGuards(SessionGuard, RequireOrgGuard)
@UseInterceptors(OrgContextInterceptor)
export class StatusController {
  constructor(private readonly service: StatusService) {}

  @Get()
  listAll(@Req() req: RequestWithAuth) {
    return this.service.listByOrg(requireOrgId(req));
  }

  @Get(':residentId')
  getByResident(
    @Req() req: RequestWithAuth,
    @Param('residentId') residentId: string,
  ) {
    return this.service.getByResident(requireOrgId(req), residentId);
  }
}

function requireOrgId(req: RequestWithAuth): string {
  const orgId = req.user?.orgId;
  if (!orgId) throw new ForbiddenException('Organization context required');
  return orgId;
}
