import { ConflictException, Injectable } from '@nestjs/common';
import { AlertWriterService } from '../alerts/alert-writer.service.js';
import { AlertEventsService } from '../alerts/services/alert-events.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  StaleTimestampException,
  TenantMismatchException,
} from '../common/domain-errors.js';
import type { IngestCameraInfo } from './hmac.guard.js';
import type { ParsedIngestAlertRequestDto } from './dto/ingest-alert.dto.js';
import { buildEventDedupKey } from '../events/event-recorder.service.js';

const FRESHNESS_WINDOW_MS = 5 * 60 * 1000;

@Injectable()
export class IngestAlertService {
  constructor(
    private readonly writer: AlertWriterService,
    private readonly prisma: PrismaService,
    private readonly alertEventsService: AlertEventsService,
  ) {}

  async ingestAlert(
    camera: IngestCameraInfo,
    input: ParsedIngestAlertRequestDto,
  ) {
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

    if (camera.ingestMode === 'EVENT_API') {
      throw new ConflictException('camera_ingest_mode_event_api');
    }

    const idempotencyKey = buildEventDedupKey(
      camera.id,
      input.detectedAt,
      input.type,
    );

    const alert = await this.writer.writeAlert({
      facilityId: camera.facilityId,
      residentId: input.resident_id,
      cameraId: camera.id,
      spaceId: camera.spaceId,
      type: input.type,
      probability: input.probability,
      snapshotKey: null,
      detectedAt: input.detectedAt,
      idempotencyKey,
    });
    await this.ensureOutboxForIngest(camera, input, idempotencyKey, {
      resident: alert.resident ?? null,
      space: alert.space ?? null,
    });
    return {
      alertSeq: alert.alertSeq.toString(),
      id: alert.id,
      status: alert.created ? 'created' : 'duplicate',
    };
  }

  private async ensureOutboxForIngest(
    camera: IngestCameraInfo,
    input: ParsedIngestAlertRequestDto,
    idempotencyKey: string,
    context: {
      resident: { name: string } | null;
      space: { name: string } | null;
    } | null,
  ): Promise<void> {
    await this.alertEventsService.ensureOutboxForIngest({
      facilityId: camera.facilityId,
      sourceId: camera.id,
      externalEventId: idempotencyKey,
      type: input.type,
      detectedAt: input.detectedAt,
      confidence: input.probability,
      residentName: context?.resident?.name,
      residentRoom: context?.space?.name ?? null,
    });
  }
}

