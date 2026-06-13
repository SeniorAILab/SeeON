import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Param,
  Patch,
  Query,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { AlertStatus } from '@prisma/client';
import { RequireOrgGuard, SessionGuard } from '../auth/session.guard.js';
import { OrgContextInterceptor } from '../auth/org-context.interceptor.js';
import type { RequestWithAuth } from '../auth/session.guard.js';
import { AlertsService } from './alerts.service.js';
import { OrgScopedNotFoundException } from '../common/domain-errors.js';

@Controller()
@UseGuards(SessionGuard, RequireOrgGuard)
@UseInterceptors(OrgContextInterceptor)
export class AlertsController {
  constructor(private readonly service: AlertsService) {}

  @Get('api/alerts')
  list(
    @Req() req: RequestWithAuth,
    @Query('residentId') residentId?: string,
    @Query('status') status?: string,
    @Query('afterSeq') afterSeq?: string,
    @Query('limit') limit?: string,
  ) {
    const validStatus = Object.values(AlertStatus).includes(
      status as AlertStatus,
    )
      ? (status as AlertStatus)
      : undefined;
    return this.service.list(requireOrgId(req), {
      residentId,
      status: validStatus,
      afterSeq: afterSeq ? BigInt(afterSeq) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Get('api/alerts/:id')
  getOne(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.getOne(requireOrgId(req), id);
  }

  @Patch('api/alerts/:id/ack')
  @HttpCode(200)
  ack(@Req() req: RequestWithAuth, @Param('id') id: string) {
    return this.service.ack(requireOrgId(req), id);
  }

  /**
   * GET /api/snapshots/:alertId — Snapshot proxy (F5).
   * Verifies alert.orgId == req.user.orgId, then streams file from local disk.
   * Backend never dereferences edge URLs (SSRF-safe).
   */
  @Get('api/snapshots/:alertId')
  async snapshot(
    @Req() req: RequestWithAuth,
    @Param('alertId') alertId: string,
    @Res() res: Response,
  ) {
    const alert = await this.service.getOne(requireOrgId(req), alertId);
    if (!alert.snapshotKey) throw new OrgScopedNotFoundException('snapshot');

    // snapshotKey is a relative path under SNAPSHOT_DIR (never an edge URL).
    const snapshotDir =
      process.env.SNAPSHOT_DIR ?? path.join(process.cwd(), 'snapshots');
    const filePath = path.join(snapshotDir, alert.snapshotKey);

    // Path traversal guard: resolved path must be under snapshotDir.
    if (!filePath.startsWith(path.resolve(snapshotDir))) {
      throw new OrgScopedNotFoundException('snapshot');
    }

    if (!fs.existsSync(filePath))
      throw new OrgScopedNotFoundException('snapshot');

    res.setHeader('content-type', 'image/jpeg');
    res.setHeader('cache-control', 'private, max-age=300');
    fs.createReadStream(filePath).pipe(res);
  }
}

function requireOrgId(req: RequestWithAuth): string {
  const orgId = req.user?.orgId;
  if (!orgId) throw new ForbiddenException('Organization context required');
  return orgId;
}
