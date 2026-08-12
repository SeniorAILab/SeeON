import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

// Type/enum canonicalization (trim+lowercase) and enum-membership validation
// for `type`, plus the blank-after-trim check for `camera_id`, stay owned by
// EventRecorderService.record() (already independently re-validates both
// with matching BadRequestException messages). These decorators only add
// the type-safety net needed to prevent a 500 (TypeError) if a field arrives
// with the wrong JS type entirely.
export class RecordEventRequestDto {
  @ApiProperty({ description: 'Edge camera identifier' })
  @IsString()
  camera_id!: string;

  @ApiProperty({
    description: 'Event type (canonicalized server-side, e.g. fall)',
  })
  @IsString()
  type!: string;

  // Only strings are coerced to Date; other JS types (number epoch millis,
  // boolean, etc.) pass through unchanged so @IsDate rejects them with 400,
  // matching the pre-migration requireString(...) + Date(...) + NaN reject.
  @ApiProperty({
    description: 'ISO-8601 detection timestamp from the edge',
    type: String,
    format: 'date-time',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? new Date(value) : value,
  )
  @IsDate()
  detected_at!: Date;

  @ApiPropertyOptional({ description: 'Model confidence score' })
  @ValidateIf((o: RecordEventRequestDto) => o.confidence !== undefined)
  @IsNumber()
  confidence?: number;

  @ApiPropertyOptional({ description: 'ML config version active at detection' })
  @ValidateIf((o: RecordEventRequestDto) => o.config_version !== undefined)
  @IsNumber()
  config_version?: number;

  @ApiPropertyOptional({ description: 'Model version string from the edge' })
  @ValidateIf((o: RecordEventRequestDto) => o.model_version !== undefined)
  @IsString()
  model_version?: string;

  @ApiPropertyOptional({ description: 'Detector version string from the edge' })
  @ValidateIf((o: RecordEventRequestDto) => o.detector_version !== undefined)
  @IsString()
  detector_version?: string;

  @ApiPropertyOptional({
    description: 'Operating threshold used for the detection decision',
  })
  @ValidateIf((o: RecordEventRequestDto) => o.operating_threshold !== undefined)
  @IsNumber()
  operating_threshold?: number;

  // Nullable (unlike the other optional string fields above): mirrors the
  // pre-migration optionalNullableString() check, which allowed null.
  @ApiPropertyOptional({
    description: 'Snapshot object key when a still was captured',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  snapshot_key?: string | null;

  @ApiPropertyOptional({ description: 'Linked media clip id when available' })
  @ValidateIf((o: RecordEventRequestDto) => o.clip_id !== undefined)
  @IsString()
  clip_id?: string;

  @ApiPropertyOptional({ description: 'Edge clock source identifier' })
  @ValidateIf((o: RecordEventRequestDto) => o.clock_source !== undefined)
  @IsString()
  clock_source?: string;

  @ApiPropertyOptional({
    description: 'Edge-side event id used for ingest dedupe',
  })
  @ValidateIf((o: RecordEventRequestDto) => o.edge_event_id !== undefined)
  @IsString()
  edge_event_id?: string;

  // Never read by the controller or service today (dead field on the wire
  // contract) — stays fully permissive per the "no manual check today" rule.
  @ApiPropertyOptional({
    description:
      'Optional facility id on the wire; ignored by the server (facility comes from edge auth)',
  })
  facility_id?: string;
}
export class RecordHeartbeatRequestDto {
  @ApiProperty({ description: 'Edge camera identifier reporting heartbeat' })
  @IsString()
  camera_id!: string;
}
export class ListEventsQueryDto {
  @ApiPropertyOptional({
    description: 'Max items to return (minimum 1)',
    type: Number,
    minimum: 1,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? Number(value) : value,
  )
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Opaque pagination cursor' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

export interface RecordHeartbeatResponseDto {
  ok: true;
}

export type RecordEventResponseDto =
  | {
      readonly id: string;
      readonly status: 'created' | 'duplicate';
    }
  | {
      readonly id: string;
      readonly event_id: string;
      readonly edge_event_id: string;
      readonly status: 'accepted';
    };

export interface EventResponseDto {
  id: string;
  facilityId: string;
  cameraId: string;
  spaceId: string;
  type: string;
  confidence: number | null;
  detectedAt: Date;
  createdAt: Date;
  modifiedAt: Date;
  configVersion: number | null;
  modelVersion: string | null;
  detectorVersion: string | null;
  operatingThreshold: number | null;
  snapshotKey: string | null;
  clockSource: string | null;
}
export interface PaginatedEventsResponseDto {
  items: EventResponseDto[];
  nextCursor: string | null;
}
