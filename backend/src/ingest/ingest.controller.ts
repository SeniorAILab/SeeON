/**
 * POST /ingest/alerts — HMAC-authenticated alert ingest endpoint (F4/F7/Tension3).
 *
 * Auth: HmacIngestGuard verifies X-Ingest-Key-Id + X-Signature + X-Ingest-Timestamp.
 * Idempotency: server-derived key = sha256(cameraId + detected_at + type).
 * Tenant coherence: camera.facilityId must match payload.facility_id.
 * Snapshot: payload.snapshot_url is ignored (SSRF prevention). Snapshot is stored
 *            via a separate upload endpoint as an internal key.
 * Distinct alerts are NEVER dropped — only exact-duplicate idempotencyKey is deduplicated.
 */
import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  Post,
  Req,
  UseGuards,
  VERSION_NEUTRAL,
  Version,
} from '@nestjs/common';
import { HmacIngestGuard } from './hmac.guard.js';
import type {
  IngestCameraInfo,
  RequestWithIngestCamera,
} from './hmac.guard.js';
import { CamerasService } from '../cameras/cameras.service.js';
import { IngestAlertService } from './ingest-alert.service.js';
import {
  type IngestAlertRequestDto,
  parseIngestAlertRequestDto,
} from './dto/ingest-alert.dto.js';

@Controller('ingest')
export class IngestController {
  constructor(
    private readonly cameras: CamerasService,
    private readonly ingestAlertService: IngestAlertService,
  ) {}

  @Version(VERSION_NEUTRAL)
  @Post('alerts')
  @UseGuards(HmacIngestGuard)
  @HttpCode(201)
  async ingestAlert(
    @Req() req: RequestWithIngestCamera,
    @Body() body: IngestAlertRequestDto,
  ) {
    const camera = requireIngestCamera(req);
    const parsedBody = parseIngestAlertRequestDto(body);
    return this.ingestAlertService.ingestAlert(camera, parsedBody);
  }
  /**
   * POST /ingest/heartbeat — HMAC-authenticated camera heartbeat (F6).
   *
   * Canonical body for HMAC: all body fields absent → sign "|||"
   * (same HmacIngestGuard, empty-body canonical).
   * Updates Camera.lastSeenAt + Camera.online.
   */
  @Version(VERSION_NEUTRAL)
  @Post('heartbeat')
  @UseGuards(HmacIngestGuard)
  @HttpCode(200)
  async heartbeat(@Req() req: RequestWithIngestCamera) {
    const camera = requireIngestCamera(req);
    await this.cameras.recordHeartbeat(camera.facilityId, camera.id);
    return { ok: true };
  }
}

function requireIngestCamera(req: RequestWithIngestCamera): IngestCameraInfo {
  if (!req.ingestCamera) {
    throw new BadRequestException('Ingest camera context required');
  }
  return req.ingestCamera;
}
