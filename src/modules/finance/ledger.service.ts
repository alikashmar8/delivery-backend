import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, QueryFailedError, Repository } from 'typeorm';
import type { AuditRequestContext } from '../audit/audit-request-context';
import { AuditService } from '../audit/audit.service';
import { hashPayload } from '../idempotency/idempotency.util';
import { User, UserStatus } from '../users/entities/user.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { LedgerEvent } from './entities/ledger-event.entity';
import {
  normalizeLedgerEvent,
  type LedgerEventInput,
  type LedgerEventKind,
} from './ledger-event';

// Internal finance boundary. Public workflows must authorize their actor/scope before calling.
@Injectable()
export class LedgerService {
  constructor(
    @InjectRepository(LedgerEvent)
    private readonly events: Repository<LedgerEvent>,
    private readonly audit: AuditService,
  ) {}

  async post(input: LedgerEventInput, context?: AuditRequestContext) {
    try {
      return await this.events.manager.transaction(
        async (manager) => await this.postWithManager(manager, input, context),
      );
    } catch (error) {
      if (error instanceof QueryFailedError) {
        const code = (error.driverError as { code?: string }).code;
        if (code === '23505')
          throw new ConflictException(
            'Financial source has already been posted',
          );
        if (['23514', '23503', 'P0002'].includes(code ?? ''))
          throw new BadRequestException(
            'Invalid financial source, scope or posting group',
          );
      }
      throw error;
    }
  }

  async postWithManager(
    manager: EntityManager,
    input: LedgerEventInput,
    context?: AuditRequestContext,
  ) {
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('Ledger posting requires an active transaction');
    const event = normalizeLedgerEvent(input);
    const payloadHash = hashPayload(event);
    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
      [`ledger:${event.kind}:${event.sourceId}`],
    );
    const repo = manager.getRepository(LedgerEvent);
    const existing = await repo.findOneBy({
      kind: event.kind,
      sourceId: event.sourceId,
    });
    if (existing) {
      if (existing.payloadHash !== payloadHash)
        throw new ConflictException('Conflicting financial event replay');
      return await this.loadEvent(manager, existing);
    }
    if (
      event.createdById !== null &&
      !(await manager.getRepository(User).exists({
        where: { id: event.createdById, status: UserStatus.ACTIVE },
      }))
    )
      throw new ForbiddenException('Financial actor is not active');
    const saved = await repo.save({
      kind: event.kind,
      sourceId: event.sourceId,
      payloadHash,
      entryCount: event.entries.length,
      createdById: event.createdById,
      occurredAt: new Date(event.occurredAt),
    });
    const referenceType =
      event.kind === 'priced' || event.kind === 'collection'
        ? 'delivery'
        : event.kind === 'charge'
          ? 'charge'
          : event.kind === 'settlement'
            ? 'settlement'
            : 'adjustment';
    const entries =
      event.entries.length === 0
        ? []
        : await manager.getRepository(LedgerEntry).save(
            event.entries.map((entry, eventIndex) => ({
              ...entry,
              eventId: saved.id,
              eventIndex,
              referenceType,
              referenceId: event.sourceId,
              createdById: event.createdById,
              occurredAt: new Date(event.occurredAt),
            })),
          );
    if (event.createdById !== null) {
      await this.audit.recordWithManager(
        manager,
        event.createdById,
        'ledger.post',
        'LedgerEvent',
        saved.id,
        {
          businessId:
            entries.find((entry) => entry.beneficiaryBusinessId)
              ?.beneficiaryBusinessId ?? null,
          after: {
            kind: saved.kind,
            sourceId: saved.sourceId,
            entryIds: entries.map((entry) => entry.id),
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      );
    }
    return { event: saved, entries };
  }

  async findEvent(
    kind: LedgerEventKind,
    sourceId: string,
    manager = this.events.manager,
  ) {
    const event = await manager
      .getRepository(LedgerEvent)
      .findOneBy({ kind, sourceId });
    return event ? await this.loadEvent(manager, event) : null;
  }

  private async loadEvent(manager: EntityManager, event: LedgerEvent) {
    const entries = await manager.getRepository(LedgerEntry).find({
      where: { eventId: event.id },
      order: { eventIndex: 'ASC', id: 'ASC' },
      take: 20,
    });
    return { event, entries };
  }

  async deriveBalance(
    scope: {
      type: 'driver' | 'user' | 'business';
      id: string;
      currency: 'USD';
    },
    manager = this.events.manager,
  ): Promise<string> {
    if (
      scope.currency !== 'USD' ||
      !['driver', 'user', 'business'].includes(scope.type)
    )
      throw new BadRequestException('Invalid balance scope or currency');
    // Custody, revenue and refund facts have no outstanding-balance effect (ADR-28).
    const rows: { balance: string }[] = await manager.query(
      `
      WITH effects AS (
        SELECT e.*, coalesce(r."entryType", e."entryType") AS original_type,
          CASE WHEN e."entryType" = 'REVERSAL' THEN -1 ELSE 1 END AS multiplier,
          CASE WHEN e."entryType" = 'ADJUSTMENT' AND e."beneficiaryType" = 'platform'
            THEN a."beneficiaryUserId" ELSE e."beneficiaryUserId" END AS sender_user,
          CASE WHEN e."entryType" = 'ADJUSTMENT' AND e."beneficiaryType" = 'platform'
            THEN a."beneficiaryBusinessId" ELSE e."beneficiaryBusinessId" END AS sender_business
        FROM ledger_entries e
        LEFT JOIN ledger_entries r ON r.id = e."reversesEntryId"
        LEFT JOIN ledger_entries a ON a.id = e."adjustsEntryId"
        WHERE e.currency = $1
      )
      SELECT coalesce(sum(amount::numeric * multiplier * CASE
        WHEN original_type IN ('DRIVER_EARNING','COD_PAYABLE') THEN 1
        WHEN original_type IN ('DRIVER_DAILY_CHARGE','DRIVER_MONTHLY_CHARGE','DELIVERY_FEE_CHARGED','SETTLEMENT') THEN -1
        WHEN original_type = 'ADJUSTMENT' THEN CASE WHEN "beneficiaryType" = 'platform' THEN -1 ELSE 1 END
        ELSE 0 END), 0)::text AS balance
      FROM effects WHERE
        ($2 = 'driver' AND "driverId" = $3::uuid) OR
        ($2 = 'user' AND "driverId" IS NULL AND sender_user = $3::uuid) OR
        ($2 = 'business' AND "driverId" IS NULL AND sender_business = $3::uuid)
    `,
      [scope.currency, scope.type, scope.id],
    );
    return rows[0].balance;
  }
}
