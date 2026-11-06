import { ApiProperty } from '@nestjs/swagger';
import { AuthenticatedUserResponseDto } from '../../users/dto/user-response.dto';

export class OtpSentResponseDto {
  @ApiProperty({ example: 'OTP sent' })
  message!: string;
}

export class VerificationTokenResponseDto {
  @ApiProperty()
  verified!: true;

  @ApiProperty({ writeOnly: true })
  verificationToken!: string;
}

export class TokenResponseDto {
  @ApiProperty({ type: () => AuthenticatedUserResponseDto })
  user!: AuthenticatedUserResponseDto;

  @ApiProperty({ readOnly: true })
  accessToken!: string;

  @ApiProperty({ readOnly: true })
  refreshToken!: string;
}

export class RefreshTokenResponseDto {
  @ApiProperty({ readOnly: true })
  accessToken!: string;

  @ApiProperty({ readOnly: true })
  refreshToken!: string;
}

export class SuccessResponseDto {
  @ApiProperty({ example: true })
  success!: true;
}
