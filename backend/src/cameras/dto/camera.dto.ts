import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString } from 'class-validator';

// Existing authenticated camera write endpoints are permissive by design:
// CamerasService enforces required-field/format rules via ConflictException
// (409), so the global ValidationPipe must not preempt those with a 400.
export class CreateCameraRequestDto {
  @ApiProperty({ description: 'Camera display label' })
  label!: string;

  @ApiProperty({ description: 'Space (room) id the camera is mounted in' })
  spaceId!: string;

  // Write-only: RTSP endpoint for the camera. Settable on create/update but
  // never returned by any read/response DTO (see cameras.service toCameraDto)
  // and never logged. Plaintext in Phase-1; at-rest encryption is Phase-2.
  @ApiPropertyOptional({
    description: 'Write-only RTSP URL; never returned on read responses',
    nullable: true,
  })
  rtspUrl?: string | null;
}

export class UpdateCameraRequestDto {
  @ApiPropertyOptional({ description: 'Camera display label' })
  label?: string;

  @ApiPropertyOptional({
    description: 'Space (room) id the camera is mounted in',
  })
  spaceId?: string;

  // Write-only (see CreateCameraRequestDto).
  @ApiPropertyOptional({
    description: 'Write-only RTSP URL; never returned on read responses',
    nullable: true,
  })
  rtspUrl?: string | null;
}

export class EdgeCameraMappingRequestDto {
  @ApiProperty({ description: 'Edge-local camera reference string' })
  @IsString()
  edge_camera_ref!: string;

  @ApiProperty({ description: 'Camera display label' })
  @IsString()
  label!: string;

  @ApiProperty({ description: 'Space (room) id the camera is mounted in' })
  @IsString()
  spaceId!: string;
}

export interface EdgeCameraMappingResponseDto {
  cameraId: string;
  spaceId: string;
  facilityId: string;
}
