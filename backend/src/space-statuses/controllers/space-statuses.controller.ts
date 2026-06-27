// ML routing (ADR-023/047): ML signal --(HMAC)--> POST /ingest/alerts  [single canonical ingress]
//   -> backend policy owns: DetectionEvent(space/zone) write -> SpaceStatus(read-model) update
//   -> AlertRule evaluation -> Kakao fan-out (ADR-044).
// ML must NOT write DetectionEvent/SpaceStatus directly and MUST NOT add a new ingress namespace.
// This controller is a deferred read-model surface: guarded + 501 until the read-model lands.

import {
  Controller,
  ForbiddenException,
  Get,
  NotImplementedException,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FacilityContextInterceptor } from '../../auth/facility-context.interceptor.js';
import {
  RequireFacilityGuard,
  SessionGuard,
} from '../../auth/session.guard.js';
import type { RequestWithAuth } from '../../auth/session.guard.js';

@Controller({ path: 'space-statuses', version: '1' })
@UseGuards(SessionGuard, RequireFacilityGuard)
@UseInterceptors(FacilityContextInterceptor)
export class SpaceStatusesController {
  @Get()
  list(@Req() req: RequestWithAuth): never {
    requireFacilityId(req);
    throw new NotImplementedException({
      error: 'not_implemented',
      message: 'space-statuses is not implemented yet',
    });
  }
}

function requireFacilityId(req: RequestWithAuth): string {
  const facilityId = req.user?.facilityId;
  if (!facilityId) throw new ForbiddenException('Facility context required');
  return facilityId;
}
