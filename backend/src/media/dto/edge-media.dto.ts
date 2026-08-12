import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsString,
  Max,
  Min,
} from 'class-validator';

const EDGE_UNAVAILABLE_REASONS = [
  'CAPTURE_FAILED',
  'QUEUE_FULL',
  'CORRUPT',
  'UPLOAD_TIMEOUT',
] as const;

export class EdgeMediaCapabilityQueryDto {
  @ApiProperty({ description: 'Edge camera id to query media capability for' })
  @IsString()
  camera_id!: string;
}

export class ReportUnavailableClipRequestDto {
  @ApiProperty({ description: 'Edge camera id that failed to produce a clip' })
  @IsString()
  camera_id!: string;

  @ApiProperty({
    description: 'Event reference ids that will not receive a clip',
    type: [String],
    minItems: 1,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsString({ each: true })
  event_refs!: string[];

  @ApiProperty({
    description: 'Monotonic media state version from the edge',
    type: Number,
    minimum: 1,
    maximum: 2_147_483_647,
  })
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  state_version!: number;

  @ApiProperty({
    description: 'Why the clip is unavailable',
    enum: EDGE_UNAVAILABLE_REASONS,
  })
  @IsIn(EDGE_UNAVAILABLE_REASONS)
  reason!: (typeof EDGE_UNAVAILABLE_REASONS)[number];
}
