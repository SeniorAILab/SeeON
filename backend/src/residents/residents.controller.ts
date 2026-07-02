import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiCookieAuth } from '@nestjs/swagger';
import { RequireFacilityGuard, JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RequireCapability, RolesGuard } from '../auth/roles.guard.js';
import { FacilityContextInterceptor } from '../auth/facility-context.interceptor.js';
import type { RequestWithAuth } from '../auth/jwt-auth.guard.js';
import type {
  CreateResidentRequestDto,
  MoveResidentAssignmentRequestDto,
  ResidentAssignmentQueryDto,
  ResidentListQueryDto,
  UpdateResidentRequestDto,
} from './dto/resident.dto.js';
import { ResidentsService } from './residents.service.js';

@Controller({ path: 'residents', version: '1' })
@ApiCookieAuth()
@UseGuards(JwtAuthGuard, RequireFacilityGuard)
@UseInterceptors(FacilityContextInterceptor)
export class ResidentsController {
  constructor(private readonly service: ResidentsService) {}

  @Get()
  list(@Req() req: RequestWithAuth, @Query() query: ResidentListQueryDto) {
    return this.service.list(requireFacilityId(req), {
      isFocusResident: parseBoolean(query.isFocusResident),
      spaceId: query.spaceId,
      active: parseBoolean(query.active),
    });
  }

  @Get('assignments')
  listAssignments(
    @Req() req: RequestWithAuth,
    @Query() query: ResidentAssignmentQueryDto,
  ) {
    return this.service.listAssignments(requireFacilityId(req), {
      residentId: query.residentId,
      spaceId: query.spaceId,
      zoneId: query.zoneId,
      active: parseBoolean(query.active),
    });
  }

  @Get(':id')
  getOne(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.getOne(requireFacilityId(req), id);
  }

  @UseGuards(RolesGuard)
  @RequireCapability('facilityAdmin')
  @Post()
  create(@Req() req: RequestWithAuth, @Body() body: CreateResidentRequestDto) {
    return this.service.create(requireFacilityId(req), body);
  }

  @UseGuards(RolesGuard)
  @RequireCapability('facilityAdmin')
  @Patch(':id')
  update(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: UpdateResidentRequestDto,
  ) {
    return this.service.update(requireFacilityId(req), id, body);
  }

  @UseGuards(RolesGuard)
  @RequireCapability('facilityAdmin')
  @Delete(':id')
  remove(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.remove(requireFacilityId(req), id);
  }

  @Get(':id/assignment')
  currentAssignment(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.currentAssignment(requireFacilityId(req), id);
  }

  @UseGuards(RolesGuard)
  @RequireCapability('facilityAdmin')
  @Put(':id/assignment')
  move(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: MoveResidentAssignmentRequestDto,
  ) {
    return this.service.move(requireFacilityId(req), id, body);
  }
}

function requireFacilityId(req: RequestWithAuth): string {
  const facilityId = req.effectiveFacilityId ?? req.user?.facilityId;
  if (!facilityId) throw new ForbiddenException('Facility context required');
  return facilityId;
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  return value === 'true';
}
