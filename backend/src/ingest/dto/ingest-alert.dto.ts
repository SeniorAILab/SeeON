import { BadRequestException } from '@nestjs/common';
import { MissingFieldException } from '../../common/domain-errors.js';

export interface IngestAlertBody {
  resident_id?: unknown;
  facility_id?: unknown;
  probability?: unknown;
  snapshot_url?: unknown;
  detected_at?: unknown;
  type?: unknown;
}

export interface ParsedIngestAlertBody {
  resident_id: string;
  facility_id: string;
  probability: number;
  detectedAt: Date;
  type: string;
}

const REQUIRED_FIELDS = [
  'resident_id',
  'facility_id',
  'probability',
  'detected_at',
  'type',
] as const;

export function parseIngestAlertBody(
  body: IngestAlertBody,
): ParsedIngestAlertBody {
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

  return {
    resident_id: String(body.resident_id),
    facility_id: String(body.facility_id),
    probability,
    detectedAt,
    type: String(body.type),
  };
}
