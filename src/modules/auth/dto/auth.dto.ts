import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsPhoneNumber,
  IsString,
  Length,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class SendOtpDto {
  @ApiProperty({ example: '+96170123456' })
  @IsPhoneNumber()
  phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '+96170123456' })
  @IsPhoneNumber()
  phone!: string;

  @ApiProperty({ example: '123456', pattern: '^\\d{6}$' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class RegisterDto {
  @ApiProperty({ example: '+96170123456' })
  @IsPhoneNumber()
  phone!: string;

  @ApiPropertyOptional({
    example: '123456',
    pattern: '^\\d{6}$',
    description: 'Required when verificationToken is not provided',
  })
  @ValidateIf((dto: RegisterDto) => !dto.verificationToken)
  @IsString()
  @Length(6, 6)
  otpCode?: string;

  @ApiPropertyOptional({
    example: 'verification-token',
    description: 'Required when otpCode is not provided',
  })
  @ValidateIf((dto: RegisterDto) => !dto.otpCode)
  @ApiProperty({ example: 'Ali Haddad', minLength: 1, maxLength: 255 })
  @IsString()
  verificationToken?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(255)
  displayName!: string;

  @ApiPropertyOptional({ example: 'ali@example.com', format: 'email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: 'correct-horse-battery-staple',
    minLength: 8,
    format: 'password',
    writeOnly: true,
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class LoginPasswordDto {
  @ApiProperty({ example: 'ali@example.com', format: 'email' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 8, format: 'password', writeOnly: true })
  @IsString()
  @MinLength(8)
  password!: string;
}

export class LoginOtpDto {
  @ApiProperty({ example: '+96170123456' })
  @IsPhoneNumber()
  phone!: string;

  @ApiProperty({ example: '123456', pattern: '^\\d{6}$' })
  @IsString()
  @Length(6, 6)
  code!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  refreshToken!: string;
}
