import { describe, expect, it, vi } from 'vitest';
import { BusinessesService } from '../businesses/businesses.service';
import {
  BusinessMemberRole,
  BusinessMemberStatus,
} from '../businesses/entities/business-member.entity';
import { BusinessStatus } from '../businesses/entities/business.entity';
import { PricingService } from '../pricing/pricing.service';

type AuditOptions = {
  businessId?: string | null;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  userAgent?: string | null;
};

function auditRecorder() {
  return vi.fn(
    async (
      _manager: unknown,
      _actorId: string,
      _action: string,
      _entityType: string,
      _entityId: string,
      _options: AuditOptions,
    ) => ({}),
  );
}

/**
 * S05: admin mutation audit tests (A13).
 * Verifies member/pricing writes persist their audit entry atomically
 * with safe (secret-free) snapshots.
 */
describe('S05 admin mutation audit', () => {
  it('records member.add with a safe snapshot inside the transaction', async () => {
    const businessRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'b1', status: 'active' }),
    };
    const outerMemberRepo = {
      findOne: vi
        .fn()
        .mockResolvedValueOnce({
          role: BusinessMemberRole.OWNER,
          status: 'active',
        })
        .mockResolvedValueOnce(null),
    };
    const innerMemberRepo = {
      create: vi.fn((value: unknown) => value),
      save: vi.fn(async (value: unknown) => ({
        ...(value as object),
        id: 'member-id',
      })),
    };
    const manager = {
      getRepository: vi.fn(() => innerMemberRepo),
    };
    const dataSource = {
      transaction: vi.fn(async (callback: any) => await callback(manager)),
    };
    const recordWithManager = auditRecorder();
    const service = new BusinessesService(
      dataSource as never,
      businessRepo as never,
      outerMemberRepo as never,
      { recordWithManager } as never,
    );

    const membership = await service.addMember(
      'b1',
      'user-1',
      BusinessMemberRole.OPERATOR,
      'owner-1',
    );

    expect(membership).toMatchObject({ id: 'member-id' });
    expect(dataSource.transaction).toHaveBeenCalledOnce();
    expect(recordWithManager).toHaveBeenCalledOnce();
    const [, actorId, action, entityType, entityId, options] =
      recordWithManager.mock.calls[0];
    expect(actorId).toBe('owner-1');
    expect(action).toBe('member.add');
    expect(entityType).toBe('BusinessMember');
    expect(entityId).toBe('member-id');
    expect(options).toMatchObject({
      businessId: 'b1',
      before: null,
      after: {
        businessId: 'b1',
        userId: 'user-1',
        role: BusinessMemberRole.OPERATOR,
        status: BusinessMemberStatus.ACTIVE,
      },
    });
    expect(JSON.stringify(options)).not.toContain('passwordHash');
  });

  it('records member.remove with before/after inside the transaction', async () => {
    const removedAt = new Date('2026-09-19T00:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(removedAt);
    try {
      const membership = {
        id: 'member-id',
        businessId: 'b1',
        userId: 'user-1',
        role: BusinessMemberRole.OPERATOR,
        status: BusinessMemberStatus.ACTIVE,
        deletedAt: null,
      };
      const memberRepo = {
        findOne: vi
          .fn()
          .mockResolvedValueOnce({
            role: BusinessMemberRole.OWNER,
            status: 'active',
          })
          .mockResolvedValueOnce({ ...membership }),
        save: vi.fn(async (value: any) => value),
      };
      const businessRepo = {
        findOne: vi
          .fn()
          .mockResolvedValue({ id: 'b1', status: BusinessStatus.ACTIVE }),
      };
      const manager = {
        getRepository: vi.fn((entity: any) =>
          entity?.name === 'Business' ? businessRepo : memberRepo,
        ),
      };
      // findOne is called on the manager repositories; route by arguments.
      const dataSource = {
        transaction: vi.fn(async (callback: any) => await callback(manager)),
      };
      const recordWithManager = auditRecorder();
      const service = new BusinessesService(
        dataSource as never,
        {} as never,
        {
          findOne: vi.fn(),
          count: vi.fn(),
        } as never,
        { recordWithManager } as never,
      );

      // removeMember uses only the transaction manager repos; drive it
      // through the real method with manager-backed fakes.
      await service.removeMember('b1', 'user-1', 'owner-1');

      expect(recordWithManager).toHaveBeenCalledOnce();
      const [, actorId, action, entityType, entityId, options] =
        recordWithManager.mock.calls[0];
      expect(actorId).toBe('owner-1');
      expect(action).toBe('member.remove');
      expect(entityType).toBe('BusinessMember');
      expect(entityId).toBe('member-id');
      expect(options.before).toMatchObject({
        businessId: 'b1',
        userId: 'user-1',
        role: BusinessMemberRole.OPERATOR,
      });
      expect(options.after).toMatchObject({ deletedAt: removedAt });
    } finally {
      vi.useRealTimers();
    }
  });

  it('records pricing.create with a safe tariff snapshot', async () => {
    const ruleRepo = {
      create: vi.fn((value: unknown) => value),
      save: vi.fn(async (value: unknown) => ({
        ...(value as object),
        id: 'rule-id',
      })),
    };
    const manager = { getRepository: vi.fn(() => ruleRepo) };
    const repo = {
      manager: { transaction: vi.fn(async (cb: any) => await cb(manager)) },
    };
    const memberRepo = {
      findOne: vi.fn().mockResolvedValue({
        role: BusinessMemberRole.OWNER,
        status: 'active',
      }),
    };
    const businessRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'b1', status: 'active' }),
    };
    const recordWithManager = auditRecorder();
    const pricing = new PricingService(
      repo as never,
      {} as never,
      memberRepo as never,
      businessRepo as never,
      {} as never,
      { recordWithManager } as never,
    );

    const rule = await pricing.create('owner-1', {
      businessId: 'b1',
      baseFee: '500',
    } as never);

    expect(rule).toMatchObject({ id: 'rule-id' });
    expect(recordWithManager).toHaveBeenCalledOnce();
    const [, actorId, action, entityType, entityId, options] =
      recordWithManager.mock.calls[0];
    expect(actorId).toBe('owner-1');
    expect(action).toBe('pricing.create');
    expect(entityType).toBe('PricingRule');
    expect(entityId).toBe('rule-id');
    expect(options.before).toBeNull();
    expect(options.after).toMatchObject({ baseFee: '500' });
    expect(JSON.stringify(options)).not.toContain('passwordHash');
  });
});
