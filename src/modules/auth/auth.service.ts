import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import {
  AuthenticatedUserResponseDto,
  toAuthenticatedUserResponse,
} from '../users/dto/user-response.dto';
import { RefreshToken } from '../users/entities/refresh-token.entity';
import { User, UserStatus } from '../users/entities/user.entity';
import { OTP_PROVIDER, type OtpProvider } from './otp/otp-provider';
import { OTP_STATE, type OtpState } from './otp/otp-state';

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 5 * 60_000;
export const OTP_MAX_ATTEMPTS = 5;
export const VERIFICATION_TTL_MS = 10 * 60_000;
export const RATE_LIMIT_WINDOW_MS = 15 * 60_000;

export const OTP_SEND_PHONE_LIMIT = 5;
export const OTP_SEND_IP_LIMIT = 30;
export const OTP_SEND_GLOBAL_LIMIT = 1_000;
export const OTP_CHECK_PHONE_LIMIT = 10;
export const OTP_CHECK_IP_LIMIT = 60;
export const PASSWORD_EMAIL_LIMIT = 10;
export const PASSWORD_IP_LIMIT = 60;
export const REGISTER_PHONE_LIMIT = 10;
export const REGISTER_IP_LIMIT = 60;

export interface TokenResponse {
  user: AuthenticatedUserResponseDto;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
    @Inject(OTP_PROVIDER) private readonly otpProvider: OtpProvider,
    @Inject(OTP_STATE) private readonly otpState: OtpState,
  ) {}

  generateOtp(): string {
    return String(randomInt(100_000, 1_000_000)).padStart(OTP_LENGTH, '0');
  }

  hashOtp(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  async sendOtp(
    phone: string,
    clientIp?: string,
  ): Promise<{ message: string }> {
    const normalizedPhone = this.normalizePhone(phone);
    await this.enforceRateLimit([
      { key: `otp-send:phone:${normalizedPhone}`, limit: OTP_SEND_PHONE_LIMIT },
      ...(clientIp
        ? [{ key: `otp-send:ip:${clientIp}`, limit: OTP_SEND_IP_LIMIT }]
        : []),
      { key: 'otp-send:global', limit: OTP_SEND_GLOBAL_LIMIT },
    ]);

    const code = this.generateOtp();
    // Dispatch first: a stored challenge implies the provider accepted the
    // message. Provider failures fail closed (503) without storing anything.
    try {
      await this.otpProvider.send(normalizedPhone, code);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('OTP delivery unavailable');
    }
    await this.otpState.requestChallenge(
      normalizedPhone,
      this.hashOtp(code),
      OTP_TTL_MS,
    );

    // OTPs and full phone numbers must never be written to application logs.
    return { message: 'OTP sent' };
  }

  async verifyOtp(
    phone: string,
    code: string,
    clientIp?: string,
  ): Promise<{ verified: true; verificationToken: string }> {
    const normalizedPhone = this.normalizePhone(phone);
    await this.enforceRateLimit([
      {
        key: `otp-verify:phone:${normalizedPhone}`,
        limit: OTP_CHECK_PHONE_LIMIT,
      },
      ...(clientIp
        ? [{ key: `otp-verify:ip:${clientIp}`, limit: OTP_CHECK_IP_LIMIT }]
        : []),
    ]);
    await this.consumeOtp(normalizedPhone, code);

    const verificationToken = randomBytes(32).toString('hex');
    await this.otpState.createProof(
      this.hashToken(verificationToken),
      normalizedPhone,
      VERIFICATION_TTL_MS,
    );
    return { verified: true, verificationToken };
  }

  /**
   * Returning-user OTP login. Consumes a single-use phone challenge and
   * issues the standard token pair when the phone belongs to an existing
   * active user. Unknown phones get a generic 401 so login does not become
   * a phone-registration oracle beyond what registration already reveals.
   */
  async loginWithOtp(
    phone: string,
    code: string,
    clientIp?: string,
  ): Promise<TokenResponse> {
    const normalizedPhone = this.normalizePhone(phone);
    await this.enforceRateLimit([
      {
        key: `otp-login:phone:${normalizedPhone}`,
        limit: OTP_CHECK_PHONE_LIMIT,
      },
      ...(clientIp
        ? [{ key: `otp-login:ip:${clientIp}`, limit: OTP_CHECK_IP_LIMIT }]
        : []),
    ]);
    await this.consumeOtp(normalizedPhone, code);

    const user = await this.userRepo.findOne({
      where: { phone: normalizedPhone },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }
    return await this.issueTokens(user);
  }

  async register(opts: {
    phone: string;
    otpCode?: string;
    verificationToken?: string;
    displayName: string;
    email?: string;
    password?: string;
    clientIp?: string;
  }): Promise<TokenResponse> {
    const phone = this.normalizePhone(opts.phone);
    await this.enforceRateLimit([
      { key: `register:phone:${phone}`, limit: REGISTER_PHONE_LIMIT },
      ...(opts.clientIp
        ? [{ key: `register:ip:${opts.clientIp}`, limit: REGISTER_IP_LIMIT }]
        : []),
    ]);
    await this.consumeRegistrationProof(
      phone,
      opts.otpCode,
      opts.verificationToken,
    );

    const passwordHash = opts.password
      ? await this.hashPassword(opts.password)
      : null;
    return await this.dataSource.transaction(async (manager) => {
      const userRepo = manager.getRepository(User);
      const existing = await userRepo.findOne({
        where: { phone },
        withDeleted: true,
      });
      if (existing && !existing.deletedAt) {
        throw new ConflictException('Phone number already registered');
      }

      const user = await userRepo.save(
        userRepo.create({
          phone,
          email: opts.email?.trim().toLowerCase() ?? null,
          displayName: opts.displayName.trim(),
          passwordHash,
          status: UserStatus.ACTIVE,
        }),
      );
      return await this.issueTokens(user, manager);
    });
  }

  async loginWithPassword(
    email: string,
    password: string,
    clientIp?: string,
  ): Promise<TokenResponse> {
    const normalizedEmail = email.trim().toLowerCase();
    await this.enforceRateLimit([
      {
        key: `password-login:email:${normalizedEmail}`,
        limit: PASSWORD_EMAIL_LIMIT,
      },
      ...(clientIp
        ? [{ key: `password-login:ip:${clientIp}`, limit: PASSWORD_IP_LIMIT }]
        : []),
    ]);

    const user = await this.userRepo.findOne({
      where: { email: normalizedEmail },
    });
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Account is not active');
    }

    const valid = await this.verifyPassword(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');
    return await this.issueTokens(user);
  }

  async refreshTokens(
    refreshTokenValue: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHash = this.hashToken(refreshTokenValue);

    return await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(RefreshToken);
      // Lock only the refresh_tokens row: FOR UPDATE with a joined relation would
      // also lock the users row, over-broadly serializing unrelated user writes.
      const stored = await repo.findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });

      if (!stored || stored.revokedAt) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      if (stored.expiresAt <= new Date()) {
        throw new UnauthorizedException('Refresh token expired');
      }

      const userRepo = manager.getRepository(User);
      const user = await userRepo.findOne({ where: { id: stored.userId } });
      if (!user || user.status !== UserStatus.ACTIVE) {
        throw new UnauthorizedException('Account is not active');
      }

      stored.revokedAt = new Date();
      await repo.save(stored);
      const tokens = await this.issueTokens(user, manager);
      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
      };
    });
  }

  async logout(refreshTokenValue: string): Promise<void> {
    const tokenHash = this.hashToken(refreshTokenValue);
    await this.refreshRepo.update({ tokenHash }, { revokedAt: new Date() });
  }

  private async consumeRegistrationProof(
    phone: string,
    otpCode?: string,
    verificationToken?: string,
  ): Promise<void> {
    if (verificationToken) {
      const consumed = await this.otpState.consumeProof(
        this.hashToken(verificationToken),
        phone,
      );
      if (!consumed) {
        throw new UnauthorizedException('Invalid or expired OTP verification');
      }
      return;
    }
    if (!otpCode) throw new UnauthorizedException('OTP verification required');
    await this.consumeOtp(phone, otpCode);
  }

  private async consumeOtp(phone: string, code: string): Promise<void> {
    const result = await this.otpState.consumeChallenge(
      phone,
      this.hashOtp(code),
      OTP_MAX_ATTEMPTS,
    );
    if (result === 'not-found') {
      throw new UnauthorizedException('OTP not found or expired');
    }
    if (result === 'invalid') {
      throw new UnauthorizedException('Invalid OTP');
    }
  }

  private async issueTokens(
    user: User,
    manager?: EntityManager,
  ): Promise<TokenResponse> {
    const payload = { sub: user.id };
    const accessToken = this.jwt.sign(payload, {
      secret: this.config.getOrThrow<string>('jwt.accessSecret'),
      expiresIn: (this.config.get<string>('jwt.accessExpiration') ??
        '15m') as never,
    });
    const refreshTokenRaw = this.jwt.sign(
      { ...payload, jti: randomUUID() },
      {
        secret: this.config.getOrThrow<string>('jwt.refreshSecret'),
        expiresIn: (this.config.get<string>('jwt.refreshExpiration') ??
          '14d') as never,
      },
    );

    const repo = manager?.getRepository(RefreshToken) ?? this.refreshRepo;
    await repo.save(
      repo.create({
        userId: user.id,
        tokenHash: this.hashToken(refreshTokenRaw),
        expiresAt: new Date(
          Date.now() +
            this.parseDuration(
              this.config.get<string>('jwt.refreshExpiration') ?? '14d',
            ),
        ),
      }),
    );

    return {
      user: toAuthenticatedUserResponse(user),
      accessToken,
      refreshToken: refreshTokenRaw,
    };
  }

  private async enforceRateLimit(
    scopes: Array<{ key: string; limit: number }>,
  ): Promise<void> {
    for (const scope of scopes) {
      const allowed = await this.otpState.checkLimit(
        scope.key,
        scope.limit,
        RATE_LIMIT_WINDOW_MS,
      );
      if (!allowed) {
        throw new HttpException(
          'Too many authentication attempts',
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
  }

  private normalizePhone(phone: string): string {
    return phone.replace(/[\s()-]/g, '');
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async hashPassword(password: string): Promise<string> {
    const { hash } = await import('argon2');
    return await hash(password);
  }

  private async verifyPassword(
    password: string,
    hash: string,
  ): Promise<boolean> {
    try {
      const { verify } = await import('argon2');
      return await verify(hash, password);
    } catch {
      return false;
    }
  }

  private parseDuration(value: string): number {
    const match = value.match(/^(\d+)([mhd])$/);
    if (!match) return 14 * 24 * 60 * 60 * 1000;
    const count = Number.parseInt(match[1], 10);
    const multipliers: Record<string, number> = {
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
    };
    return count * multipliers[match[2]];
  }
}
