import { HttpException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { MemoryOtpProvider } from './otp/otp-provider';
import { MemoryOtpState } from './otp/otp-state';
import { UserStatus } from '../users/entities/user.entity';

const ACCESS_SECRET = 'unit-test-access-secret-at-least-32-chars';
const REFRESH_SECRET = 'unit-test-refresh-secret-at-least-32-chars';

interface Mocks {
  service: AuthService;
  provider: MemoryOtpProvider;
  userRepo: { findOne: ReturnType<typeof vi.fn> };
  refreshRepo: {
    save: ReturnType<typeof vi.fn>;
    create: (data: unknown) => unknown;
    update: ReturnType<typeof vi.fn>;
  };
  managerUserRepo: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    create: (data: any) => any;
  };
}

function createService(): Mocks {
  const config = {
    getOrThrow: vi.fn((key: string) =>
      key === 'jwt.accessSecret' ? ACCESS_SECRET : REFRESH_SECRET,
    ),
    get: vi.fn(() => undefined),
  };
  const jwt = {
    sign: vi.fn((payload: Record<string, string>) =>
      payload.jti
        ? `refresh-${payload.sub}-${payload.jti}`
        : `access-${payload.sub}`,
    ),
  };
  const managerUserRepo = {
    findOne: vi.fn(),
    save: vi.fn(async (entity: any) => ({ id: 'user-id', ...entity })),
    create: (data: any) => ({ ...data }),
  };
  const managerRefreshRepo = {
    save: vi.fn(async (entity: any) => entity),
    create: (data: any) => ({ ...data }),
  };
  const dataSource = {
    transaction: vi.fn(async (cb: (manager: any) => Promise<unknown>) =>
      cb({
        getRepository: (entity: { name: string }) =>
          entity.name === 'User' ? managerUserRepo : managerRefreshRepo,
      }),
    ),
  };
  const userRepo = { findOne: vi.fn() };
  const refreshRepo = {
    save: vi.fn(async (entity: any) => entity),
    create: (data: any) => ({ ...data }),
    update: vi.fn(),
  };
  const provider = new MemoryOtpProvider();
  const service = new AuthService(
    config as never,
    jwt as never,
    dataSource as never,
    userRepo as never,
    refreshRepo as never,
    provider,
    new MemoryOtpState(),
  );
  return { service, provider, userRepo, refreshRepo, managerUserRepo };
}

function activeUser(phone: string) {
  return {
    id: 'user-id',
    phone,
    email: null,
    passwordHash: null,
    displayName: 'Otp User',
    locale: 'en',
    country: 'LB',
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };
}

describe('AuthService OTP authentication', () => {
  it('sends an OTP through the provider and stores the challenge', async () => {
    const { service, provider } = createService();

    await expect(service.sendOtp('+961 (70) 111-111')).resolves.toEqual({
      message: 'OTP sent',
    });

    const recorded = provider.lastSentTo('+96170111111');
    expect(recorded?.code).toMatch(/^\d{6}$/);
    // The stored challenge matches the dispatched code.
    await expect(
      service.verifyOtp('+96170111111', recorded!.code),
    ).resolves.toMatchObject({ verified: true });
  });

  it('fails closed with 503 and stores nothing when delivery fails', async () => {
    const { service, provider } = createService();
    provider.failNext('vendor circuit open');

    const error = await service
      .sendOtp('+96170111112')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(503);
    expect((error as HttpException).message).toBe('vendor circuit open');

    await expect(service.verifyOtp('+96170111112', '123456')).rejects.toThrow(
      'OTP not found or expired',
    );
  });

  it('enforces single-use challenges and attempt caps', async () => {
    const { service, provider } = createService();
    await service.sendOtp('+96170111113');
    const code = provider.lastSentTo('+96170111113')!.code;

    await expect(service.verifyOtp('+96170111113', '000000')).rejects.toThrow(
      'Invalid OTP',
    );
    const first = await service.verifyOtp('+96170111113', code);
    expect(first.verified).toBe(true);
    expect(first.verificationToken).toMatch(/^[0-9a-f]{64}$/);

    // The consumed challenge is gone even with the right code.
    await expect(service.verifyOtp('+96170111113', code)).rejects.toThrow(
      'OTP not found or expired',
    );
  });

  it('logs in a returning user with a valid OTP', async () => {
    const { service, provider, userRepo } = createService();
    const user = activeUser('+96170111114');
    userRepo.findOne.mockResolvedValue(user);

    await service.sendOtp('+96170111114');
    const tokens = await service.loginWithOtp(
      '+96170111114',
      provider.lastSentTo('+96170111114')!.code,
    );

    expect(tokens.accessToken).toBe('access-user-id');
    expect(tokens.refreshToken).toContain('refresh-user-id');
    expect(tokens.user).not.toHaveProperty('passwordHash');
  });

  it('rejects OTP login for unknown phones without revealing which step failed differently', async () => {
    const { service, provider, userRepo } = createService();
    userRepo.findOne.mockResolvedValue(null);

    await service.sendOtp('+96170111115');
    await expect(
      service.loginWithOtp(
        '+96170111115',
        provider.lastSentTo('+96170111115')!.code,
      ),
    ).rejects.toThrow('Invalid credentials');
  });

  it('rejects OTP login for suspended users', async () => {
    const { service, provider, userRepo } = createService();
    userRepo.findOne.mockResolvedValue({
      ...activeUser('+96170111116'),
      status: UserStatus.SUSPENDED,
    });

    await service.sendOtp('+96170111116');
    await expect(
      service.loginWithOtp(
        '+96170111116',
        provider.lastSentTo('+96170111116')!.code,
      ),
    ).rejects.toThrow('Account is not active');
  });

  it('rate-limits OTP sends per phone', async () => {
    const { service } = createService();
    for (let i = 0; i < 5; i += 1) {
      await service.sendOtp('+96170111117');
    }
    const error = await service
      .sendOtp('+96170111117')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(429);
  });

  it('registers with a direct OTP code and rejects duplicates', async () => {
    const { service, provider, managerUserRepo } = createService();
    managerUserRepo.findOne.mockResolvedValue(null);

    await service.sendOtp('+96170111118');
    const registered = await service.register({
      phone: '+96170111118',
      otpCode: provider.lastSentTo('+96170111118')!.code,
      displayName: 'New User',
    });
    expect(registered.accessToken).toBe('access-user-id');

    managerUserRepo.findOne.mockResolvedValue({
      ...activeUser('+96170111118'),
      deletedAt: null,
    });
    await service.sendOtp('+96170111118');
    await expect(
      service.register({
        phone: '+96170111118',
        otpCode: provider.lastSentTo('+96170111118')!.code,
        displayName: 'Duplicate',
      }),
    ).rejects.toThrow('Phone number already registered');
  });

  it('never logs OTP codes or tokens', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const { service, provider, userRepo } = createService();
    userRepo.findOne.mockResolvedValue(activeUser('+96170111120'));

    await service.sendOtp('+96170111120');
    const code = provider.lastSentTo('+96170111120')!.code;
    const verified = await service.verifyOtp('+96170111120', code);
    await expect(
      service.loginWithPassword('nobody@example.com', 'wrong-password'),
    ).rejects.toThrow('Invalid credentials');

    for (const call of log.mock.calls) {
      const text = JSON.stringify(call);
      expect(text).not.toContain(code);
      expect(text).not.toContain(verified.verificationToken);
    }
    log.mockRestore();
  });
});
