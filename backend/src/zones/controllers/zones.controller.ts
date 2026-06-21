import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ZoneType } from '@prisma/client';
import { FacilityContextInterceptor } from '../../auth/facility-context.interceptor.js';
import {
  RequireFacilityGuard,
  SessionGuard,
} from '../../auth/session.guard.js';
import type { RequestWithAuth } from '../../auth/session.guard.js';
import type { CreateZoneDto, UpdateZoneDto } from '../dto/zone.dto.js';
import { ZonesService } from '../services/zones.service.js';

@Controller('api/zones')
@UseGuards(SessionGuard, RequireFacilityGuard)
@UseInterceptors(FacilityContextInterceptor)
export class ZonesController {
  constructor(private readonly service: ZonesService) {}
  @Get() list(
    @Req() req: RequestWithAuth,
    @Query('spaceId') spaceId?: string,
    @Query('type') type?: ZoneType,
  ) {
    return this.service.list(requireFacilityId(req), { spaceId, type });
  }
  @Post() create(@Req() req: RequestWithAuth, @Body() body: CreateZoneDto) {
    return this.service.create(requireFacilityId(req), body);
  }
  @Patch(':zoneId') update(
    @Req() req: RequestWithAuth,
    @Param('zoneId') zoneId: string,
    @Body() body: UpdateZoneDto,
  ) {
    return this.service.update(requireFacilityId(req), zoneId, body);
  }
  @Delete(':zoneId')
  @HttpCode(204)
  async remove(@Req() req: RequestWithAuth, @Param('zoneId') zoneId: string) {
    await this.service.remove(requireFacilityId(req), zoneId);
  }
}
function requireFacilityId(req: RequestWithAuth): string {
  const facilityId = req.user?.facilityId;
  if (!facilityId) throw new ForbiddenException('Facility context required');
  return facilityId;
}
