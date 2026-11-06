import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiTooManyRequestsResponse,
  ApiServiceUnavailableResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  LoginOtpDto,
  LoginPasswordDto,
  RefreshTokenDto,
  RegisterDto,
  SendOtpDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import {
  OtpSentResponseDto,
  RefreshTokenResponseDto,
  SuccessResponseDto,
  TokenResponseDto,
  VerificationTokenResponseDto,
} from './dto/auth-response.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('otp/send')
  @ApiOperation({ summary: 'Request OTP code for registration' })
  @ApiResponse({
    status: 200,
    description: 'OTP sent successfully (or rate limited)',
    type: OtpSentResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid phone number format' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  @ApiServiceUnavailableResponse({
    description: 'OTP provider unavailable (production)',
  })
  async sendOtp(@Body() dto: SendOtpDto, @Ip() ip: string) {
    return await this.authService.sendOtp(dto.phone, ip);
  }

  @Post('otp/verify')
  @ApiOperation({ summary: 'Verify OTP code for registration' })
  @ApiResponse({
    status: 200,
    description: 'OTP verified, returns verification token',
    type: VerificationTokenResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid or expired OTP' })
  @ApiUnauthorizedResponse({ description: 'OTP verification failed' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async verifyOtp(@Body() dto: VerifyOtpDto, @Ip() ip: string) {
    return await this.authService.verifyOtp(dto.phone, dto.code, ip);
  }

  @Post('register')
  @ApiOperation({ summary: 'Register new user account' })
  @ApiResponse({
    status: 201,
    description:
      'User registered successfully, returns access and refresh tokens',
    type: TokenResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid input or verification token' })
  @ApiConflictResponse({ description: 'Phone or email already registered' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async register(@Body() dto: RegisterDto, @Ip() ip: string) {
    return await this.authService.register({
      phone: dto.phone,
      otpCode: dto.otpCode,
      verificationToken: dto.verificationToken,
      email: dto.email,
      displayName: dto.displayName,
      password: dto.password,
      clientIp: ip,
    });
  }

  @Post('login/password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 200,
    description: 'Login successful, returns access and refresh tokens',
    type: TokenResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async loginWithPassword(@Body() dto: LoginPasswordDto, @Ip() ip: string) {
    return await this.authService.loginWithPassword(
      dto.email,
      dto.password,
      ip,
    );
  }

  @Post('login/otp')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login existing user with OTP code' })
  @ApiResponse({
    status: 200,
    description: 'Login successful, returns access and refresh tokens',
    type: TokenResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid OTP or user not found',
  })
  @ApiTooManyRequestsResponse({ description: 'Rate limit exceeded' })
  async loginWithOtp(@Body() dto: LoginOtpDto, @Ip() ip: string) {
    return await this.authService.loginWithOtp(dto.phone, dto.code, ip);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    type: RefreshTokenResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return await this.authService.refreshTokens(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
    type: SuccessResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid refresh token' })
  async logout(@Body() dto: RefreshTokenDto) {
    return await this.authService.logout(dto.refreshToken);
  }
}
