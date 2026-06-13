import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RequireOrgGuard, SessionGuard } from '../auth/session.guard.js';
import { OrgContextInterceptor } from '../auth/org-context.interceptor.js';
import type { RequestWithAuth } from '../auth/session.guard.js';
import { GuardiansService } from './guardians.service.js';

@Controller('api/guardians')
@UseGuards(SessionGuard, RequireOrgGuard)
@UseInterceptors(OrgContextInterceptor)
export class GuardiansController {
  constructor(private readonly service: GuardiansService) {}

  @Get()
  list(@Req() req: RequestWithAuth, @Query('residentId') residentId?: string) {
    return this.service.list(requireOrgId(req), residentId);
  }

  @Get(':id')
  getOne(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.getOne(requireOrgId(req), id);
  }

  @Post()
  create(
    @Req() req: RequestWithAuth,
    @Body()
    body: {
      residentId?: string;
      name?: string;
      phone?: string;
      relation?: string;
    },
  ) {
    return this.service.create(requireOrgId(req), {
      residentId: body.residentId ?? '',
      name: body.name ?? '',
      phone: body.phone ?? '',
      relation: body.relation,
    });
  }

  @Patch(':id')
  update(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: { name?: string; phone?: string; relation?: string },
  ) {
    return this.service.update(requireOrgId(req), id, body);
  }
}

function requireOrgId(req: RequestWithAuth): string {
  const orgId = req.user?.orgId;
  if (!orgId) throw new ForbiddenException('Organization context required');
  return orgId;
}
