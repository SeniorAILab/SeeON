/**
 * POST /ingest/alerts — HMAC-authenticated alert ingest endpoint (F4/F7/Tension3).
 *
 * Auth: HmacIngestGuard verifies X-Ingest-Key-Id + X-Signature + X-Ingest-Timestamp.
 * Idempotency: server-derived key = sha256(cameraId + detected_at + type).
 * Tenant coherence: camera.orgId must match payload.facility_id;
 *                   camera.residentId must match payload.resident_id (if assigned).
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
} from '@nestjs/common';
import * as crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { HmacIngestGuard } from './hmac.guard.js';
import type {
  IngestCameraInfo,
  RequestWithIngestCamera,
} from './hmac.guard.js';
import { AlertWriterService } from '../alerts/alert-writer.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  MissingFieldException,
  StaleTimestampException,
  TenantMismatchException,
} from '../common/domain-errors.js';

interface IngestAlertBody {
  resident_id?: unknown;
  facility_id?: unknown;
  probability?: unknown;
  snapshot_url?: unknown;
  detected_at?: unknown;
  type?: unknown;
}

const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

@Controller('ingest')
export class IngestController {
  constructor(
    private readonly writer: AlertWriterService,
    private readonly prisma: PrismaService,
  ) {}

  @Post('alerts')
  @UseGuards(HmacIngestGuard)
  @HttpCode(201)
  async ingestAlert(
    @Req() req: RequestWithIngestCamera,
    @Body() body: IngestAlertBody,
  ) {
    // AC9: validate required contract fields.
    const requiredFields = [
      'resident_id',
      'facility_id',
      'probability',
      'detected_at',
      'type',
    ] as const;
    for (const field of requiredFields) {
      if (
        body[field] === undefined ||
        body[field] === null ||
        body[field] === ''
      ) {
        throw new MissingFieldException(field);
      }
    }

    const resident_id = String(body.resident_id);
    const facility_id = String(body.facility_id);
    const type = String(body.type);
    const probability = Number(body.probability);
    const detectedAt = new Date(String(body.detected_at));

    if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
      throw new BadRequestException(
        'probability must be a number between 0 and 1',
      );
    }
    if (isNaN(detectedAt.getTime())) {
      throw new BadRequestException(
        'detected_at must be a valid ISO 8601 date',
      );
    }

    // Freshness: reject detected_at more than 5 min old or future.
    if (Math.abs(Date.now() - detectedAt.getTime()) > FRESHNESS_WINDOW_MS) {
      throw new StaleTimestampException();
    }

    // Tenant coherence: camera.orgId must match facility_id.
    const camera = requireIngestCamera(req);
    if (camera.orgId !== facility_id) {
      throw new TenantMismatchException(
        `Camera org '${camera.orgId}' does not match facility_id '${facility_id}'`,
      );
    }
    // If camera is assigned to a resident, it must match.
    if (camera.residentId && camera.residentId !== resident_id) {
      throw new TenantMismatchException(
        `Camera is assigned to resident '${camera.residentId}', not '${resident_id}'`,
      );
    }

    // Server-derived idempotency key (F4/Tension3).
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${camera.id}|${detectedAt.toISOString()}|${type}`)
      .digest('hex');

    // Write alert (serialized + SSE emit). Exact duplicate → Prisma unique error → return 200.
    try {
      const alert = await this.writer.writeAlert({
        orgId: camera.orgId,
        residentId: resident_id,
        cameraId: camera.id,
        type,
        probability,
        snapshotKey: null, // F7: snapshot_url in payload is ignored; upload via PUT separately.
        detectedAt,
        idempotencyKey,
      });
      return {
        alertSeq: alert.alertSeq.toString(),
        id: alert.id,
        status: 'created',
      };
    } catch (err: unknown) {
      // Prisma unique constraint violation = exact duplicate — idempotent 200.
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'P2002'
      ) {
        // Fetch and return the existing alert.
        const existing = await this.prisma.withOrgContext(
          camera.orgId,
          (tx: Prisma.TransactionClient) =>
            tx.alert.findFirst({
              where: { orgId: camera.orgId, idempotencyKey },
            }),
        );
        return {
          alertSeq: existing?.alertSeq?.toString() ?? '0',
          id: existing?.id ?? '',
          status: 'duplicate',
        };
      }
      throw err;
    }
  }
}

function requireIngestCamera(req: RequestWithIngestCamera): IngestCameraInfo {
  if (!req.ingestCamera) {
    throw new BadRequestException('Ingest camera context required');
  }
  return req.ingestCamera;
}
