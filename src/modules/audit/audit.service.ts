import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface AuditRecordInput {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  options?: {
    businessId?: string | null;
    before?: unknown;
    after?: unknown;
    ipAddress?: string | null;
    userAgent?: string | null;
  };
}

/**
 * Service for recording immutable administration audit logs.
 *
 * Usage pattern:
 * 1. Capture before state
 * 2. Execute business logic (within transaction if possible)
 * 3. Call auditService.record() to persist the audit entry
 * 4. Audit entry is immutable thereafter
 */
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
  ) {}

  /**
   * Record an audit log entry.
   * Append-only: creates a new immutable record.
   *
   * @param actorId User ID performing the action
   * @param action Action name (e.g., 'member.add', 'pricing.update')
   * @param entityType Entity type (e.g., 'BusinessMember')
   * @param entityId ID of entity affected
   * @param options Additional audit context
   */
  async record(
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    options: {
      businessId?: string | null;
      before?: unknown;
      after?: unknown;
      ipAddress?: string | null;
      userAgent?: string | null;
    } = {},
  ): Promise<AuditLog> {
    const audit = this.auditRepo.create({
      actorId,
      action,
      entityType,
      entityId,
      businessId: options.businessId ?? null,
      before: options.before ?? null,
      after: options.after ?? null,
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
    });

    return await this.auditRepo.save(audit);
  }

  /**
   * Record an audit log entry inside an existing transaction.
   * Use this from transactional callers so the business mutation and its
   * audit entry commit atomically: a failed transaction leaves neither a
   * false success audit nor an unaudited mutation.
   */
  async recordWithManager(
    manager: EntityManager,
    actorId: string,
    action: string,
    entityType: string,
    entityId: string,
    options: {
      businessId?: string | null;
      before?: unknown;
      after?: unknown;
      ipAddress?: string | null;
      userAgent?: string | null;
    } = {},
  ): Promise<AuditLog> {
    const repo = manager.getRepository(AuditLog);
    const audit = repo.create({
      actorId,
      action,
      entityType,
      entityId,
      businessId: options.businessId ?? null,
      before: options.before ?? null,
      after: options.after ?? null,
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
    });
    return await repo.save(audit);
  }

  /**
   * Record several related entries with one transaction-scoped save.
   * Role reconciliation can change multiple assignments, so batching avoids
   * one database round trip per role while keeping all entries atomic.
   */
  async recordManyWithManager(
    manager: EntityManager,
    entries: AuditRecordInput[],
  ): Promise<AuditLog[]> {
    if (entries.length === 0) return [];

    const repo = manager.getRepository(AuditLog);
    const audits = entries.map(
      ({ actorId, action, entityType, entityId, options = {} }) =>
        repo.create({
          actorId,
          action,
          entityType,
          entityId,
          businessId: options.businessId ?? null,
          before: options.before ?? null,
          after: options.after ?? null,
          ipAddress: options.ipAddress ?? null,
          userAgent: options.userAgent ?? null,
        }),
    );

    return await repo.save(audits);
  }

  /**
   * Find audit logs for an entity.
   * Useful for historical tracking and compliance.
   *
   * @param entityType Entity type
   * @param entityId Entity ID
   * @returns Ordered audit entries (newest first)
   */
  async findForEntity(
    entityType: string,
    entityId: string,
  ): Promise<AuditLog[]> {
    return await this.auditRepo.find({
      where: { entityType, entityId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find audit logs for a business (optional context filter).
   *
   * @param businessId Business ID
   * @returns Ordered audit entries (newest first)
   */
  async findForBusiness(businessId: string): Promise<AuditLog[]> {
    return await this.auditRepo.find({
      where: { businessId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Find audit logs by actor.
   *
   * @param actorId User ID
   * @returns Ordered audit entries (newest first)
   */
  async findByActor(actorId: string): Promise<AuditLog[]> {
    return await this.auditRepo.find({
      where: { actorId },
      order: { createdAt: 'DESC' },
    });
  }
}
