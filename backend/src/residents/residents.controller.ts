import {
  Body,
  Controller,
  ForbiddenException,
  Delete,
  Get,
  Param,
  Patch,
  Post,
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
  list(@Req() req: RequestWithAuth) {
    return this.service.list(requireFacilityId(req));
  }

  @Get(':id')
  getOne(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.getOne(requireFacilityId(req), id);
  }

  @Post()
  create(
    @Req() req: RequestWithAuth,
    @Body() body: { name?: string; room?: string },
  ) {
    return this.service.create(requireFacilityId(req), {
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
