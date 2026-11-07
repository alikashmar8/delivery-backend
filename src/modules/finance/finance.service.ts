import { EntityManager } from 'typeorm';
import type { Delivery } from '../deliveries/entities/delivery.entity';
import { DeliveryFinancialSnapshot } from './entities/delivery-financial-snapshot.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { LedgerService } from './ledger.service';
import type { LedgerEntryInput } from './ledger-event';
import { financialSnapshotTerms } from './financial-snapshot';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { parseMoney } from '../../common/money/money';
import type { AuditRequestContext } from '../audit/audit-request-context';
import { AuditService } from '../audit/audit.service';
import { DriverProfile } from '../users/entities/driver-profile.entity';
import type { CreateAssignmentDto, CreatePlanDto } from './dto/finance.dto';
import {
  DriverCompensationPlan,
  PlanType,
} from './entities/driver-compensation-plan.entity';
import { DriverPlanAssignment } from './entities/driver-plan-assignment.entity';
import type { PlanComponents } from './plan-allocation';

@Injectable()
export class FinanceService {
  constructor(
    @InjectRepository(DriverCompensationPlan)
    private readonly plans: Repository<DriverCompensationPlan>,
    @InjectRepository(DriverPlanAssignment)
    private readonly assignments: Repository<DriverPlanAssignment>,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
  ) {}

  async hasSnapshotWithManager(manager: EntityManager, deliveryId: string) {
    return await manager
      .getRepository(DeliveryFinancialSnapshot)
      .exists({ where: { deliveryId } });
  }

  // Caller holds the delivery and driver locks; the driver lock also serializes plan changes.
  async priceWithManager(
    manager: EntityManager,
    delivery: Delivery,
    driverUserId: string,
    actorId: string,
    lockedAt: Date,
    context?: AuditRequestContext,
  ) {
    const { assignment, plan } = await this.effectivePlanWithManager(
      manager,
      delivery.driverId!,
      lockedAt,
    );
    const terms = financialSnapshotTerms(delivery, plan.components);
    const snapshot = await manager
      .getRepository(DeliveryFinancialSnapshot)
      .save({
        ...terms,
        deliveryId: delivery.id,
        pricingRuleId: delivery.pricingRuleId,
        driverCompensationPlanId: plan.id,
        driverPlanAssignmentId: assignment.id,
        lockedAt,
      });
    const entries: LedgerEntryInput[] = [];
    if (terms.customerDeliveryFee !== '0')
      entries.push({
        entryType: 'DELIVERY_FEE_CHARGED',
        amount: terms.customerDeliveryFee,
        currency: 'USD',
        deliveryId: delivery.id,
        beneficiaryType: delivery.businessId ? 'business' : 'user',
        beneficiaryBusinessId: delivery.businessId,
        beneficiaryUserId: delivery.businessId
          ? null
          : delivery.createdByUserId,
      });
    if (terms.driverEarnings !== '0')
      entries.push({
        entryType: 'DRIVER_EARNING',
        amount: terms.driverEarnings,
        currency: 'USD',
        deliveryId: delivery.id,
        driverId: delivery.driverId,
        beneficiaryType: 'user',
        beneficiaryUserId: driverUserId,
      });
    if (terms.platformDeliveryRevenue !== '0')
      entries.push({
        entryType: 'PLATFORM_DELIVERY_REVENUE',
        amount: terms.platformDeliveryRevenue,
        currency: 'USD',
        deliveryId: delivery.id,
        beneficiaryType: 'platform',
      });
    await this.ledger.postWithManager(
      manager,
      {
        kind: 'priced',
        sourceId: delivery.id,
        createdById: actorId,
        occurredAt: lockedAt.toISOString(),
        entries,
      },
      context,
    );
    return snapshot;
  }

  private async effectivePlanWithManager(
    manager: EntityManager,
    driverId: string,
    lockedAt: Date,
  ) {
    const assignment = await manager
      .getRepository(DriverPlanAssignment)
      .createQueryBuilder('a')
      .where(
        'a."driverId" = :driverId AND a."effectiveFrom" <= :at AND (a."effectiveTo" IS NULL OR a."effectiveTo" > :at)',
        { driverId, at: lockedAt },
      )
      .getOne();
    if (!assignment)
      throw new ConflictException(
        'No compensation assignment is effective at PRICED',
      );
    const plan = await manager.getRepository(DriverCompensationPlan).findOne({
      where: { id: assignment.planId },
      lock: { mode: 'pessimistic_read' },
    });
    if (
      !plan ||
      !plan.active ||
      plan.effectiveFrom > lockedAt ||
      (plan.effectiveTo && plan.effectiveTo <= lockedAt)
    )
      throw new ConflictException('Compensation plan is unavailable at PRICED');
    return { assignment, plan };
  }

  private async assertNoCollection(manager: EntityManager, deliveryId: string) {
    if (await this.ledger.findEvent('collection', deliveryId, manager))
      throw new ConflictException(
        'Collected deliveries require the reviewed collection correction workflow',
      );
  }

  private async lastEarning(manager: EntityManager, deliveryId: string) {
    return await manager
      .getRepository(LedgerEntry)
      .createQueryBuilder('e')
      .where('e."deliveryId" = :deliveryId AND e."entryType" = :type', {
        deliveryId,
        type: 'DRIVER_EARNING',
      })
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM ledger_entries next WHERE next."replacesEntryId" = e.id)',
      )
      .limit(1)
      .getOne();
  }

  private async reverseEntry(
    manager: EntityManager,
    entry: LedgerEntry,
    actorId: string,
    description: string,
    context?: AuditRequestContext,
  ) {
    await this.ledger.postWithManager(
      manager,
      {
        kind: 'reversal',
        sourceId: entry.id,
        createdById: actorId,
        occurredAt: new Date().toISOString(),
        entries: [
          {
            entryType: 'REVERSAL',
            description,
            reversesEntryId: entry.id,
            amount: entry.amount,
            currency: 'USD',
            deliveryId: entry.deliveryId,
            driverId: entry.driverId,
            beneficiaryType: entry.beneficiaryType,
            beneficiaryUserId: entry.beneficiaryUserId,
            beneficiaryBusinessId: entry.beneficiaryBusinessId,
          },
        ],
      },
      context,
    );
  }

  async unassignWithManager(
    manager: EntityManager,
    deliveryId: string,
    actorId: string,
    context?: AuditRequestContext,
  ) {
    await this.assertNoCollection(manager, deliveryId);
    const earning = await this.lastEarning(manager, deliveryId);
    if (earning)
      await this.reverseEntry(
        manager,
        earning,
        actorId,
        'Driver unassigned before collection',
        context,
      );
  }

  async reassignWithManager(
    manager: EntityManager,
    delivery: Delivery,
    driverUserId: string,
    actorId: string,
    lockedAt: Date,
    context?: AuditRequestContext,
  ) {
    await this.assertNoCollection(manager, delivery.id);
    // Eligibility still requires current terms; committed economics always use the original snapshot.
    await this.effectivePlanWithManager(manager, delivery.driverId!, lockedAt);
    const snapshot = await manager
      .getRepository(DeliveryFinancialSnapshot)
      .findOneByOrFail({ deliveryId: delivery.id });
    if (snapshot.driverEarnings !== '0') {
      const previous = await this.lastEarning(manager, delivery.id);
      if (
        !previous ||
        !(await manager
          .getRepository(LedgerEntry)
          .exists({ where: { reversesEntryId: previous.id } }))
      )
        throw new ConflictException(
          'Previous earning must be reversed before replacement',
        );
      await this.ledger.postWithManager(
        manager,
        {
          kind: 'reassignment',
          sourceId: previous.id,
          createdById: actorId,
          occurredAt: lockedAt.toISOString(),
          entries: [
            {
              entryType: 'DRIVER_EARNING',
              amount: snapshot.driverEarnings,
              currency: 'USD',
              deliveryId: delivery.id,
              driverId: delivery.driverId,
              beneficiaryType: 'user',
              beneficiaryUserId: driverUserId,
              replacesEntryId: previous.id,
            },
          ],
        },
        context,
      );
    }
    return snapshot;
  }

  async reversePricedWithManager(
    manager: EntityManager,
    deliveryId: string,
    actorId: string,
    context?: AuditRequestContext,
  ) {
    if (!(await this.ledger.findEvent('priced', deliveryId, manager))) return;
    await this.assertNoCollection(manager, deliveryId);
    // At most one live earning plus the original fee and revenue, regardless of chain length.
    const live = await manager
      .getRepository(LedgerEntry)
      .createQueryBuilder('e')
      .where('e."deliveryId" = :deliveryId', { deliveryId })
      .andWhere('e."entryType" IN (:...types)', {
        types: [
          'DELIVERY_FEE_CHARGED',
          'PLATFORM_DELIVERY_REVENUE',
          'DRIVER_EARNING',
        ],
      })
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM ledger_entries r WHERE r."reversesEntryId" = e.id)',
      )
      .orderBy('e.id', 'ASC')
      .take(3)
      .getMany();
    for (const entry of live)
      await this.reverseEntry(
        manager,
        entry,
        actorId,
        'Delivery cancelled before collection',
        context,
      );
  }

  async createPlan(
    actorId: string,
    dto: CreatePlanDto,
    context?: AuditRequestContext,
  ) {
    const allocation = dto.components.deliveryAllocation;
    const components: PlanComponents = {
      deliveryAllocation: {
        platformFixedAmount: allocation.platformFixedAmount ?? '0',
        platformPercentage: allocation.platformPercentage ?? 0,
        driverFixedAmount: allocation.driverFixedAmount ?? '0',
        driverPercentage: allocation.driverPercentage ?? 0,
        driverGetsRemainder: allocation.driverGetsRemainder ?? true,
      },
      recurringCharge: {
        type: dto.components.recurringCharge.type,
        amountMinorUnits:
          dto.components.recurringCharge.amountMinorUnits ?? '0',
        currency: dto.components.recurringCharge.currency,
      },
    };
    const recurring = components.recurringCharge;
    const amount = parseMoney(recurring.amountMinorUnits, 'amountMinorUnits');
    parseMoney(
      components.deliveryAllocation.platformFixedAmount,
      'platformFixedAmount',
    );
    parseMoney(
      components.deliveryAllocation.driverFixedAmount,
      'driverFixedAmount',
    );
    if (
      recurring.currency !== 'USD' ||
      (recurring.type === 'NONE' ? amount !== 0n : amount === 0n) ||
      (dto.type === PlanType.PER_DELIVERY && recurring.type !== 'NONE') ||
      (dto.type === PlanType.DAILY && recurring.type !== 'DAILY') ||
      (dto.type === PlanType.MONTHLY && recurring.type !== 'MONTHLY') ||
      (dto.type === PlanType.HYBRID && recurring.type === 'NONE')
    ) {
      throw new BadRequestException(
        'Recurring charge does not match plan type or amount',
      );
    }
    const normalizedAllocation = components.deliveryAllocation;
    if (
      !normalizedAllocation.driverGetsRemainder &&
      normalizedAllocation.platformPercentage +
        normalizedAllocation.driverPercentage >
        100
    ) {
      throw new BadRequestException(
        'Explicit allocation percentages cannot exceed 100',
      );
    }
    const from = dto.effectiveFrom ? new Date(dto.effectiveFrom) : new Date();
    const to = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (
      Number.isNaN(from.valueOf()) ||
      (to && (Number.isNaN(to.valueOf()) || to <= from))
    ) {
      throw new BadRequestException('Invalid plan effective interval');
    }
    return await this.plans.manager.transaction(async (manager) => {
      const plan = await manager.getRepository(DriverCompensationPlan).save({
        name: dto.name,
        type: dto.type,
        active: true,
        components,
        effectiveFrom: from,
        effectiveTo: to,
      });
      await this.audit.recordWithManager(
        manager,
        actorId,
        'driver_plan.create',
        'DriverCompensationPlan',
        plan.id,
        {
          after: {
            name: plan.name,
            type: plan.type,
            components: plan.components,
            effectiveFrom: plan.effectiveFrom,
            effectiveTo: plan.effectiveTo,
          },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      );
      return plan;
    });
  }

  async listPlans(take: number, skip: number) {
    return await this.plans.find({
      order: { createdAt: 'DESC', id: 'DESC' },
      take,
      skip,
    });
  }

  async getPlan(id: string) {
    const plan = await this.plans.findOne({ where: { id } });
    if (!plan) throw new NotFoundException('Plan not found');
    return plan;
  }

  async retirePlan(
    actorId: string,
    id: string,
    effectiveTo: string,
    context?: AuditRequestContext,
  ) {
    const to = new Date(effectiveTo);
    if (Number.isNaN(to.valueOf()))
      throw new BadRequestException('Invalid plan end');
    return await this.plans.manager.transaction(async (manager) => {
      const repo = manager.getRepository(DriverCompensationPlan);
      const plan = await repo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!plan) throw new NotFoundException('Plan not found');
      if (!plan.active || plan.effectiveTo || to <= plan.effectiveFrom)
        throw new ConflictException('Plan cannot be retired at this time');
      const activeAssignment = await manager
        .getRepository(DriverPlanAssignment)
        .createQueryBuilder('a')
        .where(
          'a."planId" = :id AND (a."effectiveTo" IS NULL OR a."effectiveTo" > :to)',
          { id, to },
        )
        .select('a.id')
        .limit(1)
        .getOne();
      if (activeAssignment)
        throw new ConflictException(
          'Plan has assignments extending beyond its end',
        );
      plan.active = false;
      plan.effectiveTo = to;
      const retired = await repo.save(plan);
      await this.audit.recordWithManager(
        manager,
        actorId,
        'driver_plan.retire',
        'DriverCompensationPlan',
        id,
        {
          before: { active: true, effectiveTo: null },
          after: { active: false, effectiveTo: to },
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
        },
      );
      return retired;
    });
  }

  async assignPlan(
    actorId: string,
    driverId: string,
    dto: CreateAssignmentDto,
    context?: AuditRequestContext,
  ) {
    const from = new Date(dto.effectiveFrom);
    const to = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (
      Number.isNaN(from.valueOf()) ||
      (to && (Number.isNaN(to.valueOf()) || to <= from))
    ) {
      throw new BadRequestException('Invalid assignment effective interval');
    }
    try {
      return await this.assignments.manager.transaction(async (manager) => {
        const driver = await manager.getRepository(DriverProfile).findOne({
          where: { id: driverId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!driver) throw new NotFoundException('Driver profile not found');
        if (driver.currency !== 'USD')
          throw new ConflictException('Driver currency must be USD');
        const plan = await manager
          .getRepository(DriverCompensationPlan)
          .findOne({
            where: { id: dto.planId },
            lock: { mode: 'pessimistic_read' },
          });
        if (
          !plan ||
          !plan.active ||
          plan.effectiveFrom > from ||
          (plan.effectiveTo && plan.effectiveTo <= from) ||
          (to && plan.effectiveTo && to > plan.effectiveTo)
        ) {
          throw new BadRequestException(
            'Plan is unavailable for the assignment interval',
          );
        }
        const repo = manager.getRepository(DriverPlanAssignment);
        const current = await repo
          .createQueryBuilder('a')
          .where(
            'a."driverId" = :driverId AND a."effectiveTo" IS NULL AND a."effectiveFrom" < :from',
            { driverId, from },
          )
          .getOne();
        if (current) {
          await repo.update(current.id, { effectiveTo: from });
        }
        const assignment = await repo.save({
          driverId,
          planId: plan.id,
          createdById: actorId,
          effectiveFrom: from,
          effectiveTo: to,
        });
        await this.audit.recordWithManager(
          manager,
          actorId,
          'driver_plan.assign',
          'DriverPlanAssignment',
          assignment.id,
          {
            before: current
              ? {
                  supersededAssignmentId: current.id,
                  previousEffectiveTo: null,
                }
              : null,
            after: {
              driverId,
              planId: plan.id,
              effectiveFrom: from,
              effectiveTo: to,
            },
            ipAddress: context?.ipAddress,
            userAgent: context?.userAgent,
          },
        );
        return assignment;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23P01')
        throw new ConflictException(
          'Driver already has a plan in this interval',
        );
      throw error;
    }
  }

  async listAssignments(driverId: string, take: number, skip: number) {
    if (
      !(await this.assignments.manager
        .getRepository(DriverProfile)
        .exists({ where: { id: driverId } }))
    ) {
      throw new NotFoundException('Driver profile not found');
    }
    return await this.assignments.find({
      where: { driverId },
      order: { effectiveFrom: 'DESC', id: 'DESC' },
      take,
      skip,
    });
  }
}
