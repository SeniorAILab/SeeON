import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import type { Prisma } from '@prisma/client';
import { AlertWriterService } from '../alerts/alert-writer.service.js';
import { AlertEventsService } from '../alerts/services/alert-events.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  StaleTimestampException,
  TenantMismatchException,
} from '../common/domain-errors.js';
import type { IngestCameraInfo } from './hmac.guard.js';
import type { ParsedIngestAlertBody } from './dto/ingest-alert.dto.js';

const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class IngestAlertService {
  constructor(
    private readonly writer: AlertWriterService,
    private readonly prisma: PrismaService,
    private readonly alertEventsService: AlertEventsService,
  ) {}

  async ingestAlert(camera: IngestCameraInfo, input: ParsedIngestAlertBody) {
    if (
      Math.abs(Date.now() - input.detectedAt.getTime()) > FRESHNESS_WINDOW_MS
    ) {
      throw new StaleTimestampException();
    }

    if (camera.facilityId !== input.facility_id) {
      throw new TenantMismatchException(
        `Camera facility '${camera.facilityId}' does not match facility_id '${input.facility_id}'`,
      );
    }

    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${camera.id}|${input.detectedAt.toISOString()}|${input.type}`)
      .digest('hex');

    try {
      const alert = await this.writer.writeAlert({
        facilityId: camera.facilityId,
        residentId: input.resident_id,
        cameraId: camera.id,
        type: input.type,
        probability: input.probability,
        snapshotKey: null,
        detectedAt: input.detectedAt,
        idempotencyKey,
      });
      await this.ensureOutboxForIngest(
        camera,
        input,
        idempotencyKey,
        alert.resident ?? null,
      );
      return {
        alertSeq: alert.alertSeq.toString(),
        id: alert.id,
        status: 'created',
      };
    } catch (err: unknown) {
      if (isPrismaUniqueError(err)) {
        const existing = await this.prisma.withFacilityContext(
          camera.facilityId,
          (tx: Prisma.TransactionClient) =>
            tx.alert.findFirst({
              where: { facilityId: camera.facilityId, idempotencyKey },
              include: { resident: { select: { name: true, room: true } } },
            }),
        );
        await this.ensureOutboxForIngest(
          camera,
          input,
          idempotencyKey,
          existing?.resident ?? null,
        );
        return {
          alertSeq: existing?.alertSeq.toString() ?? '0',
          id: existing?.id ?? '',
          status: 'duplicate',
        };
      }
      throw err;
    }
  }

  private async ensureOutboxForIngest(
    camera: IngestCameraInfo,
    input: ParsedIngestAlertBody,
    idempotencyKey: string,
    resident: { name: string; room: string | null } | null,
  ): Promise<void> {
    await this.alertEventsService.ensureOutboxForIngest({
      facilityId: camera.facilityId,
      sourceId: camera.id,
      externalEventId: idempotencyKey,
      type: input.type,
      detectedAt: input.detectedAt,
      confidence: input.probability,
      residentName: resident?.name,
      residentRoom: resident?.room ?? null,
    });
  }
}

function isPrismaUniqueError(err: unknown): boolean {
  return Boolean(
    err &&
    typeof err === 'object' &&
    'code' in err &&
    (err as { code: string }).code === 'P2002',
  );
}
