import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString, Length, Matches } from 'class-validator';

export class DashboardDeliveryReceiptRequestDto {
  @ApiProperty({
    description: 'Stable dashboard client instance id',
    minLength: 1,
    maxLength: 128,
  })
  @IsString()
  @Length(1, 128)
  dashboardClientId!: string;

  @ApiProperty({
    description: 'Backend SSE/event id that was delivered',
    minLength: 1,
    maxLength: 191,
  })
  @IsString()
  @Length(1, 191)
  backendEventId!: string;

  @ApiProperty({
    description: 'Alert id associated with the delivered event',
    minLength: 1,
    maxLength: 191,
  })
  @IsString()
  @Length(1, 191)
  alertId!: string;

  @ApiProperty({
    description: 'Monotonic alert sequence as a decimal string',
    pattern: '^\\d+$',
  })
  @Matches(/^\d+$/)
  alertSeq!: string;

  @ApiProperty({
    description: 'ISO-8601 timestamp when the client observed delivery',
    format: 'date-time',
  })
  @IsDateString()
  observedAt!: string;
}

export class DashboardPresentationReceiptRequestDto extends DashboardDeliveryReceiptRequestDto {
  @ApiProperty({
    description: 'Presentation surface identifier (e.g. floor-board)',
    pattern: '^[a-z0-9][a-z0-9:-]{0,63}$',
  })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9:-]{0,63}$/)
  surface!: string;
}
