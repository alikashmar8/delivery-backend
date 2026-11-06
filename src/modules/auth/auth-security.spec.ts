import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FindOperator } from 'typeorm';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { RBACGuard, RequiredRoles, ROLES_KEY } from './guards/rbac.guard';
import { AdminRole } from '../users/entities/admin-role-assignment.entity';
import { UserStatus } from '../users/entities/user.entity';
import { toAuthenticatedUserResponse } from '../users/dto/user-response.dto';
import { MemoryOtpProvider } from './otp/otp-provider';
import { MemoryOtpState } from './otp/otp-state';

describe('auth security', () => {
  it('serializes an authenticated user without password or internal fields', () => {
    const response = toAuthenticatedUserResponse({
      id: 'user-id',
      phone: '+96171111111',
      email: 'safe@example.com',
      passwordHash: 'must-not-leak',
      displayName: 'Safe User',
      locale: 'en',
      country: 'LB',
      status: UserStatus.ACTIVE,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02'),
      deletedAt: null,
    });

    expect(response).not.toHaveProperty('passwordHash');
    expect(response).not.toHaveProperty('deletedAt');
    expect(response).not.toHaveProperty('updatedAt');
  });

  it('does not log an OTP or phone number', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const service = new AuthService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      new MemoryOtpProvider(),
      new MemoryOtpState(),
    );

    await expect(service.sendOtp('+96171111112')).resolves.toEqual({
      message: 'OTP sent',
    });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('checks all required roles with one existence query', async () => {
    class TestController {
      @RequiredRoles(AdminRole.ADMIN, AdminRole.SUPPORT)
      handler() {}
    }
    const handler = TestController.prototype.handler;
    expect(Reflect.getMetadata(ROLES_KEY, handler)).toEqual([
      AdminRole.ADMIN,
      AdminRole.SUPPORT,
    ]);

    const repo = {
      exists: vi.fn().mockResolvedValue(true),
    };
    const guard = new RBACGuard(new Reflector(), repo as never);
    const context = {
      getHandler: () => handler,
      getClass: () => TestController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { sub: 'user-id' } }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(repo.exists).toHaveBeenCalledOnce();

    const options = repo.exists.mock.calls[0][0];
    expect(options.where).toMatchObject({
      userId: 'user-id',
      active: true,
      role: expect.any(FindOperator),
    });
    expect(options.where.role.type).toBe('in');
    expect(options.where.role.value).toEqual([
      AdminRole.ADMIN,
      AdminRole.SUPPORT,
      AdminRole.SUPER_ADMIN,
    ]);

    repo.exists.mockResolvedValue(false);
    await expect(guard.canActivate(context)).rejects.toThrow(
      'Insufficient permissions',
    );
    expect(repo.exists).toHaveBeenCalledTimes(2);
  });
});
