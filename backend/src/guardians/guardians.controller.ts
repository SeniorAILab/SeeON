import {
  Body,
  Controller,
  ForbiddenException,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { RequireFacilityGuard, SessionGuard } from '../auth/session.guard.js';
import { FacilityContextInterceptor } from '../auth/facility-context.interceptor.js';
import type { RequestWithAuth } from '../auth/session.guard.js';
import { GuardiansService } from './guardians.service.js';

@Controller('api/guardians')
@UseGuards(SessionGuard, RequireFacilityGuard)
@UseInterceptors(FacilityContextInterceptor)
export class GuardiansController {
  constructor(private readonly service: GuardiansService) {}

  @Get()
  list(@Req() req: RequestWithAuth, @Query('residentId') residentId?: string) {
    return this.service.list(requireFacilityId(req), residentId);
  }

  @Get(':id')
  getOne(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.getOne(requireFacilityId(req), id);
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
    return this.service.create(requireFacilityId(req), {
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
    return this.service.update(requireFacilityId(req), id, body);
  }

  @Delete(':id')
  remove(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.remove(requireFacilityId(req), id);
  }
}

function requireFacilityId(req: RequestWithAuth): string {
  const facilityId = req.user?.facilityId;
  if (!facilityId) throw new ForbiddenException('Facility context required');
  return facilityId;
}
