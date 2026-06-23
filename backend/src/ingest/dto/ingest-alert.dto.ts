import { BadRequestException } from '@nestjs/common';
import { MissingFieldException } from '../../common/domain-errors.js';
import {
  AlertEventTypes,
  type AlertEventType,
} from '../../alerts/dto/alert-events.dto.js';

export interface IngestAlertRequestDto {
  resident_id?: unknown;
  facility_id?: unknown;
  probability?: unknown;
  snapshot_url?: unknown;
  detected_at?: unknown;
  type?: unknown;
}

export interface ParsedIngestAlertRequestDto {
  resident_id: string | null;
  facility_id: string;
  probability: number;
  detectedAt: Date;
  type: AlertEventType;
}

const REQUIRED_FIELDS = [
  'facility_id',
  'probability',
  'detected_at',
  'type',
] as const;

const VALID_ALERT_TYPES = new Set<string>(Object.values(AlertEventTypes));

export function parseIngestAlertRequestDto(
  body: IngestAlertRequestDto,
): ParsedIngestAlertRequestDto {
  for (const field of REQUIRED_FIELDS) {
    if (
      body[field] === undefined ||
      body[field] === null ||
      body[field] === ''
    ) {
      throw new MissingFieldException(field);
    }
  }

  const probability = Number(body.probability);
  if (!Number.isFinite(probability) || probability < 0 || probability > 1) {
    throw new BadRequestException(
      'probability must be a number between 0 and 1',
    );
  }

  const detectedAt = new Date(String(body.detected_at));
  if (isNaN(detectedAt.getTime())) {
    throw new BadRequestException('detected_at must be a valid ISO 8601 date');
  }

  const type = String(body.type);
  if (!VALID_ALERT_TYPES.has(type)) {
    throw new BadRequestException(
      'type must be one of: fall, detection-lost, bed-exit',
    );
  }

  const residentId =
    typeof body.resident_id === 'string' ||
    typeof body.resident_id === 'number' ||
    typeof body.resident_id === 'boolean'
      ? String(body.resident_id)
      : null;

  return {
    resident_id: residentId && residentId.trim() ? residentId : null,
    facility_id: String(body.facility_id),
    probability,
    detectedAt,
    type: type as AlertEventType,
  };
}
