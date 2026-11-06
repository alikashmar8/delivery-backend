import { ExecutionContext } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BusinessScopeGuard } from './business-scope.guard';

function contextFor(id: string, method = 'GET'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        params: { id },
        query: { businessId: 'attacker-query-id' },
        headers: { 'x-business-id': 'attacker-header-id' },
        user: { sub: 'user-id' },
      }),
    }),
  } as unknown as ExecutionContext;
}

describe('BusinessScopeGuard', () => {
  it('uses the actual :id route parameter and ignores client scope claims', async () => {
    const repo = {
      findOne: vi.fn().mockResolvedValue({
        role: 'owner',
        business: { status: 'active' },
      }),
    };
    const guard = new BusinessScopeGuard(repo as never);

    const routeBusinessId = '00000000-0000-4000-8000-000000000001';
    await expect(guard.canActivate(contextFor(routeBusinessId))).resolves.toBe(
      true,
    );
    expect(repo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ businessId: routeBusinessId }),
      }),
    );
  });

  it('rejects cross-business access when active membership is absent', async () => {
    const guard = new BusinessScopeGuard({
      findOne: vi.fn().mockResolvedValue(null),
    } as never);
    await expect(
      guard.canActivate(contextFor('00000000-0000-4000-8000-000000000002')),
    ).rejects.toThrow('Business not found or access denied');
  });

  it('allows GET reads but denies mutations for suspended businesses', async () => {
    const memberRepo = {
      findOne: vi.fn().mockResolvedValue({
        role: 'owner',
        business: { status: 'suspended' },
      }),
    } as never;
    const guard = new BusinessScopeGuard(memberRepo);

    await expect(
      guard.canActivate(
        contextFor('00000000-0000-4000-8000-000000000003', 'GET'),
      ),
    ).resolves.toBe(true);
    await expect(
      guard.canActivate(
        contextFor('00000000-0000-4000-8000-000000000003', 'DELETE'),
      ),
    ).rejects.toThrow('Business is suspended');
  });
});
