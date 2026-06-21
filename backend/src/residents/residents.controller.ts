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
import { RequireFacilityGuard, SessionGuard } from '../auth/session.guard.js';
import { FacilityContextInterceptor } from '../auth/facility-context.interceptor.js';
import type { RequestWithAuth } from '../auth/session.guard.js';
import { ResidentsService } from './residents.service.js';

@Controller('api/residents')
@UseGuards(SessionGuard, RequireFacilityGuard)
@UseInterceptors(FacilityContextInterceptor)
export class ResidentsController {
  constructor(private readonly service: ResidentsService) {}

  @Get()
  list(
    @Req() req: RequestWithAuth,
    @Query()
    query: { isFocusResident?: string; spaceId?: string; active?: string },
  ) {
    return this.service.list(requireFacilityId(req), {
      isFocusResident: parseBoolean(query.isFocusResident),
      spaceId: query.spaceId,
      active: parseBoolean(query.active),
    });
  }

  @Get(':id')
  getOne(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.getOne(requireFacilityId(req), id);
  }

  @Post()
  create(@Req() req: RequestWithAuth, @Body() body: Record<string, unknown>) {
    return this.service.create(requireFacilityId(req), body as never);
  }

  @Patch(':id')
  update(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.update(requireFacilityId(req), id, body);
  }

  @Delete(':id')
  remove(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.remove(requireFacilityId(req), id);
  }

  @Get(':id/assignment')
  currentAssignment(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.currentAssignment(requireFacilityId(req), id);
  }

  @Put(':id/assignment')
  move(
    @Req() req: RequestWithAuth,
    @Param('id') id: string,
    @Body() body: { spaceId?: string; zoneId?: string | null },
  ) {
    return this.service.move(requireFacilityId(req), id, body);
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
