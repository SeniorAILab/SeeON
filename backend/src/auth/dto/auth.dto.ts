import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString } from 'class-validator';

// Intentionally undecorated with class-validator: AuthController.login coerces
// non-string email/password to '' and lets AuthService.loginWithPassword reject
// the result with a uniform 401. Adding @IsString() here would let the pipe
// reject wrong-typed credentials with a 400 instead, leaking a status-code
// distinction the login endpoint deliberately avoids.
export class LoginRequestDto {
  @ApiPropertyOptional({
    description: 'Login email; non-string values are coerced to empty string',
    type: String,
  })
  email?: unknown;

  @ApiPropertyOptional({
    description:
      'Login password; non-string values are coerced to empty string',
    type: String,
    format: 'password',
  })
  password?: unknown;
}

// Intentionally undecorated with class-validator: AuthService.registerWithPassword's
// requiredString/requiredPassword helpers already 400 on any non-string or
// blank value; controller-level validators here would duplicate, not
// tighten, that existing service-layer check.
export class RegisterRequestDto {
  @ApiPropertyOptional({ description: 'Facility owner display name' })
  name?: string;

  @ApiPropertyOptional({ description: 'Unique login email' })
  email?: string;

  @ApiPropertyOptional({ description: 'Account password', format: 'password' })
  password?: string;

  @ApiPropertyOptional({ description: 'Contact phone number' })
  phone?: string;

  @ApiPropertyOptional({ description: 'Initial facility display name' })
  facilityName?: string;
}

export class CreateFacilityRequestDto {
  @ApiProperty({
    description: 'Facility display name created during onboarding',
  })
  @IsString()
  facilityName!: string;
}

export class UpdateAlertSettingsRequestDto {
  @ApiPropertyOptional({
    description:
      'Notification email override; null or empty clears it and falls back to the login email',
    nullable: true,
  })
  notificationEmail?: string | null;

  @ApiPropertyOptional({
    description: 'Whether email alert delivery is enabled for this user',
  })
  emailAlertsEnabled?: boolean;
}
