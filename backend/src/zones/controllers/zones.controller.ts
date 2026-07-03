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
import { ApiCookieAuth } from '@nestjs/swagger';
import { FacilityContextInterceptor } from '../../auth/facility-context.interceptor.js';
import {
  RequireFacilityGuard,
  JwtAuthGuard,
} from '../../auth/jwt-auth.guard.js';
import { RequireCapability, RolesGuard } from '../../auth/roles.guard.js';
import type { RequestWithAuth } from '../../auth/jwt-auth.guard.js';
import type {
  CreateZoneRequestDto,
  UpdateZoneRequestDto,
  ZoneType,
} from '../dto/zone.dto.js';
import { ZonesService } from '../services/zones.service.js';

@Controller({ path: 'spaces/:spaceId/zones', version: '1' })
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RequireFacilityGuard)
@UseInterceptors(FacilityContextInterceptor)
export class ZonesController {
  constructor(private readonly service: ZonesService) {}
  @Get() list(
    @Req() req: RequestWithAuth,
    @Param('spaceId') spaceId: string,
    @Query('type') type?: ZoneType,
  ) {
    return this.service.list(requireFacilityId(req), { spaceId, type });
  }
  @UseGuards(RolesGuard)
  @RequireCapability('facilityAdmin')
  @Post()
  create(
    @Req() req: RequestWithAuth,
    @Param('spaceId') spaceId: string,
    @Body() body: CreateZoneRequestDto,
  ) {
    return this.service.create(requireFacilityId(req), { ...body, spaceId });
  }
  @UseGuards(RolesGuard)
  @RequireCapability('facilityAdmin')
  @Patch(':zoneId')
  update(
    @Req() req: RequestWithAuth,
    @Param('spaceId') spaceId: string,
    @Param('zoneId') zoneId: string,
    @Body() body: UpdateZoneRequestDto,
  ) {
    return this.service.update(requireFacilityId(req), zoneId, {
      ...body,
      spaceId,
    });
  }
  @UseGuards(RolesGuard)
  @RequireCapability('facilityAdmin')
  @Delete(':zoneId')
  @HttpCode(204)
  async remove(
    @Req() req: RequestWithAuth,
    @Param('spaceId') _spaceId: string,
    @Param('zoneId') zoneId: string,
  ) {
    await this.service.remove(requireFacilityId(req), zoneId);
  }
}
function requireFacilityId(req: RequestWithAuth): string {
  const facilityId = req.effectiveFacilityId ?? req.user?.facilityId;
  if (!facilityId) throw new ForbiddenException('Facility context required');
  return facilityId;
}
