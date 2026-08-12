import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

export const ALERT_MEDIA_ACCESS_ACTIONS = [
  'PLAY_STARTED',
  'FULLSCREEN_ENTERED',
] as const;

export type AlertMediaAccessAction =
  (typeof ALERT_MEDIA_ACCESS_ACTIONS)[number];

export class AlertMediaAccessRequestDto {
  @ApiProperty({
    description: 'Media access action being audited',
    enum: ALERT_MEDIA_ACCESS_ACTIONS,
  })
  @IsIn(ALERT_MEDIA_ACCESS_ACTIONS)
  readonly action!: AlertMediaAccessAction;

  @ApiProperty({
    description: 'Client interaction id for the access audit trail',
    maxLength: 64,
    pattern: '^[A-Za-z0-9._:-]+$',
  })
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9._:-]+$/)
  readonly interactionId!: string;
}
