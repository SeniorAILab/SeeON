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
import type {
  CreateGuardianRequestDto,
  UpdateGuardianRequestDto,
} from './dto/guardian.dto.js';
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
  create(@Req() req: RequestWithAuth, @Body() body: CreateGuardianRequestDto) {
    return this.service.create(requireFacilityId(req), {
      residentId: body.residentId,
      name: body.name,
      phone: body.phone,
      relation: body.relation,
    });
  }

  @Patch(':id')
  update(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: UpdateGuardianRequestDto,
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
