import { describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

/**
 * S05: administration audit unit tests (A13).
 * Verifies append-only recording, transactional recording, and safe payloads.
 */
describe('AuditService', () => {
  it('records an audit entry with actor, action, and safe payload', async () => {
    const create = vi.fn((value: unknown) => value);
    const save = vi.fn(async (value: unknown) => ({
      ...(value as object),
      id: 'audit-id',
    }));
    const service = new AuditService({ create, save } as never);

    const result = await service.record(
      'actor-id',
      'member.add',
      'BusinessMember',
      'member-id',
      {
        businessId: 'business-id',
        before: null,
        after: { businessId: 'business-id', role: 'operator' },
      },
    );

    expect(create).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      id: 'audit-id',
      actorId: 'actor-id',
      action: 'member.add',
      entityType: 'BusinessMember',
      entityId: 'member-id',
      businessId: 'business-id',
    });
    // Safe payload: only membership fields, never secrets.
    expect(JSON.stringify(result)).not.toContain('passwordHash');
    expect(JSON.stringify(result)).not.toContain('refreshToken');
  });

  it('records inside a transaction via the provided manager', async () => {
    const create = vi.fn((value: unknown) => value);
    const save = vi.fn(async (value: unknown) => value);
    const manager = {
      getRepository: vi.fn(() => ({ create, save })),
    };
    const service = new AuditService({} as never);

    await service.recordWithManager(
      manager as never,
      'actor-id',
      'pricing.update',
      'PricingRule',
      'rule-id',
      {
        businessId: 'business-id',
        before: { active: true },
        after: { active: false },
      },
    );

    expect(manager.getRepository).toHaveBeenCalledWith(AuditLog);
    expect(create).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
  });

  it('batches related transaction-scoped entries in one save', async () => {
    const create = vi.fn((value: unknown) => value);
    const save = vi.fn(async (value: unknown[]) => value);
    const manager = {
      getRepository: vi.fn(() => ({ create, save })),
    };
    const service = new AuditService({} as never);

    await service.recordManyWithManager(manager as never, [
      {
        actorId: 'actor-id',
        action: 'admin_role.grant',
        entityType: 'AdminRoleAssignment',
        entityId: 'assignment-id',
        options: { after: { role: 'admin', active: true } },
      },
      {
        actorId: 'actor-id',
        action: 'admin_role.revoke',
        entityType: 'AdminRoleAssignment',
        entityId: 'other-assignment-id',
        options: { before: { role: 'support', active: true } },
      },
    ]);

    expect(manager.getRepository).toHaveBeenCalledWith(AuditLog);
    expect(create).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0]).toHaveLength(2);
  });

  it('queries audit trails newest-first', async () => {
    const find = vi.fn().mockResolvedValue([]);
    const service = new AuditService({ find } as never);

    await service.findForEntity('PricingRule', 'rule-id');
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { entityType: 'PricingRule', entityId: 'rule-id' },
        order: { createdAt: 'DESC' },
      }),
    );

    await service.findForBusiness('business-id');
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { businessId: 'business-id' } }),
    );

    await service.findByActor('actor-id');
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({ where: { actorId: 'actor-id' } }),
    );
  });
});
