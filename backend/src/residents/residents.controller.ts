import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RequireOrgGuard, SessionGuard } from '../auth/session.guard.js';
import { OrgContextInterceptor } from '../auth/org-context.interceptor.js';
import type { RequestWithAuth } from '../auth/session.guard.js';
import { ResidentsService } from './residents.service.js';

@Controller('api/residents')
@UseGuards(SessionGuard, RequireOrgGuard)
@UseInterceptors(OrgContextInterceptor)
export class ResidentsController {
  constructor(private readonly service: ResidentsService) {}

  @Get()
  list(@Req() req: RequestWithAuth) {
    return this.service.list(requireOrgId(req));
  }

  @Get(':id')
  getOne(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.getOne(requireOrgId(req), id);
  }

  @Post()
  create(
    @Req() req: RequestWithAuth,
    @Body() body: { name?: string; room?: string },
  ) {
    return this.service.create(requireOrgId(req), {
      name: body.name ?? '',
      room: body.room,
    });
  }

  @Patch(':id')
  update(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: { name?: string; room?: string },
  ) {
    return this.service.update(requireOrgId(req), id, body);
  }
}

function requireOrgId(req: RequestWithAuth): string {
  const orgId = req.user?.orgId;
  if (!orgId) throw new ForbiddenException('Organization context required');
  return orgId;
}
