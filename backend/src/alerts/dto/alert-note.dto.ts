import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';

export class CreateAlertNoteRequestDto {
  @ApiProperty({ description: 'Operator note body (non-blank)' })
  @IsString()
  @Matches(/\S/, { message: 'note is required' })
  note!: string;
}
