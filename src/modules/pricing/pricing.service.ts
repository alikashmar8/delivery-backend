import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AuditService } from '../audit/audit.service';
import type { AuditRequestContext } from '../audit/audit-request-context';
import {
  decimalToScaled,
  multiplyAndRoundHalfUp,
  parseMoney,
} from '../../common/money/money';
import {
  BusinessMember,
  BusinessMemberRole,
  BusinessMemberStatus,
} from '../businesses/entities/business-member.entity';
import {
  Business,
  BusinessStatus,
} from '../businesses/entities/business.entity';
import {
  AdminRole,
  AdminRoleAssignment,
} from '../users/entities/admin-role-assignment.entity';
import { DeliveryZone } from '../zones/entities/delivery-zone.entity';
import {
  CreatePricingRuleDto,
  UpdatePricingRuleDto,
} from './dto/pricing-rule.dto';
import { PricingRule } from './entities/pricing-rule.entity';

export interface FeeBreakdown {
  baseFee: string;
  zoneSurcharge: string;
  perKmFee: string;
  codFee: string;
  totalFee: string;
  currency: string;
  pricingRuleId: string;
  /**
   * C01: version anchor for quote reproducibility. Rules mutate in place
   * until plan versioning (C05) lands, so the persisted snapshot records
   * which effective terms produced the quote.
   */
  pricingRuleEffectiveFrom: string;
}

@Injectable()
export class PricingService {
  constructor(
    @InjectRepository(PricingRule)
    private readonly repo: Repository<PricingRule>,
    @InjectRepository(DeliveryZone)
    private readonly zoneRepo: Repository<DeliveryZone>,
    @InjectRepository(BusinessMember)
    private readonly memberRepo: Repository<BusinessMember>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(AdminRoleAssignment)
    private readonly adminRepo: Repository<AdminRoleAssignment>,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async create(
    actorUserId: string,
    dto: CreatePricingRuleDto,
    auditContext?: AuditRequestContext,
  ): Promise<PricingRule> {
    if (dto.currency && dto.currency !== 'USD')
      throw new BadRequestException('Only USD is supported');
    const businessId = dto.businessId ?? null;
    if (businessId) await this.assertBusinessActive(businessId);
    await this.assertCanManage(actorUserId, businessId);
    await this.assertZoneCompatible(dto.zoneId ?? null, businessId);
    this.validateMoneyFields(dto);
    this.assertEffectiveRange(dto.effectiveFrom, dto.effectiveTo);

    // S05: persist the rule and its audit entry atomically. The snapshot
    // carries only tariff fields (money strings, no secrets).
    return await this.repo.manager.transaction(async (manager) => {
      const ruleRepo = manager.getRepository(PricingRule);
      const rule = await ruleRepo.save(
        ruleRepo.create({
          businessId,
          zoneId: dto.zoneId ?? null,
          currency: dto.currency ?? 'USD',
          baseFee: dto.baseFee,
          perKm: dto.perKm ?? null,
          zoneSurcharge: dto.zoneSurcharge ?? '0',
          codFeePercent:
            dto.codFeePercent === undefined ? null : String(dto.codFeePercent),
          priority: dto.priority ?? 0,
          active: dto.active ?? true,
          effectiveFrom: dto.effectiveFrom
            ? new Date(dto.effectiveFrom)
            : new Date(),
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        }),
      );
      if (this.auditService) {
        await this.auditService.recordWithManager(
          manager,
          actorUserId,
          'pricing.create',
          'PricingRule',
          rule.id,
          {
            businessId,
            before: null,
            after: this.toAuditSnapshot(rule),
            ...auditContext,
          },
        );
      }
      return rule;
    });
  }

  async findAll(
    actorUserId: string,
    businessId: string | null,
    page: PaginationQueryDto,
  ): Promise<PricingRule[]> {
    await this.assertCanRead(actorUserId, businessId);
    return await this.repo.find({
      where: {
        businessId: businessId ? businessId : IsNull(),
      },
      order: { priority: 'DESC', effectiveFrom: 'DESC', id: 'ASC' },
      take: page.take,
      skip: page.skip,
    });
  }

  async findAuthorizedById(
    id: string,
    actorUserId: string,
  ): Promise<PricingRule> {
    const rule = await this.findById(id);
    await this.assertCanRead(actorUserId, rule.businessId);
    return rule;
  }

  async findById(id: string): Promise<PricingRule> {
    const rule = await this.repo.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Pricing rule not found');
    return rule;
  }

  async update(
    id: string,
    actorUserId: string,
    dto: UpdatePricingRuleDto,
    auditContext?: AuditRequestContext,
  ): Promise<PricingRule> {
    const rule = await this.findById(id);
    if (dto.currency && dto.currency !== 'USD')
      throw new BadRequestException('Only USD is supported');
    if (rule.businessId) await this.assertBusinessActive(rule.businessId);
    await this.assertCanManage(actorUserId, rule.businessId);
    this.validateMoneyFields(dto);
    this.assertEffectiveRange(
      rule.effectiveFrom.toISOString(),
      dto.effectiveTo,
    );

    const before = this.toAuditSnapshot(rule);
    if (dto.currency !== undefined) rule.currency = dto.currency;
    if (dto.baseFee !== undefined) rule.baseFee = dto.baseFee;
    if (dto.perKm !== undefined) rule.perKm = dto.perKm;
    if (dto.zoneSurcharge !== undefined) {
      rule.zoneSurcharge = dto.zoneSurcharge;
    }
    if (dto.codFeePercent !== undefined) {
      rule.codFeePercent = String(dto.codFeePercent);
    }
    if (dto.priority !== undefined) rule.priority = dto.priority;
    if (dto.active !== undefined) rule.active = dto.active;
    if (dto.effectiveTo !== undefined) {
      rule.effectiveTo = new Date(dto.effectiveTo);
    }
    // S05: persist the mutation and its audit entry atomically.
    return await this.repo.manager.transaction(async (manager) => {
      const updated = await manager.getRepository(PricingRule).save(rule);
      if (this.auditService) {
        await this.auditService.recordWithManager(
          manager,
          actorUserId,
          'pricing.update',
          'PricingRule',
          updated.id,
          {
            businessId: updated.businessId,
            before,
            after: this.toAuditSnapshot(updated),
            ...auditContext,
          },
        );
      }
      return updated;
    });
  }

  async deactivate(
    id: string,
    actorUserId: string,
    auditContext?: AuditRequestContext,
  ): Promise<void> {
    const rule = await this.findById(id);
    if (rule.businessId) await this.assertBusinessActive(rule.businessId);
    await this.assertCanManage(actorUserId, rule.businessId);
    const before = this.toAuditSnapshot(rule);
    // S05: persist the deactivation and its audit entry atomically.
    await this.repo.manager.transaction(async (manager) => {
      rule.active = false;
      const updated = await manager.getRepository(PricingRule).save(rule);
      if (this.auditService) {
        await this.auditService.recordWithManager(
          manager,
          actorUserId,
          'pricing.deactivate',
          'PricingRule',
          updated.id,
          {
            businessId: updated.businessId,
            before,
            after: this.toAuditSnapshot(updated),
            ...auditContext,
          },
        );
      }
    });
  }

  /**
   * S05: safe audit snapshot for tariff changes. Contains only pricing
   * fields (money strings, status, effective range) — no secrets.
   */
  private toAuditSnapshot(rule: PricingRule): Record<string, unknown> {
    return {
      businessId: rule.businessId,
      zoneId: rule.zoneId,
      currency: rule.currency,
      baseFee: rule.baseFee,
      perKm: rule.perKm,
      zoneSurcharge: rule.zoneSurcharge,
      codFeePercent: rule.codFeePercent,
      priority: rule.priority,
      active: rule.active,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
    };
  }

  async computeFee(
    actorUserId: string,
    params: {
      businessId?: string | null;
      zoneId?: string | null;
      codAmount?: string;
      distanceKm?: number;
      currency?: string;
    },
  ): Promise<FeeBreakdown> {
    const businessId = params.businessId ?? null;
    if (businessId) {
      await this.assertBusinessActive(businessId);
      await this.assertBusinessMember(actorUserId, businessId, false);
    }
    await this.assertZoneCompatible(params.zoneId ?? null, businessId);

    const currency = params.currency ?? 'USD';
    if (currency !== 'USD')
      throw new BadRequestException('Only USD is supported');
    const now = new Date();
    const query = this.repo
      .createQueryBuilder('rule')
      .where('rule.active = true')
      .andWhere('rule.currency = :currency', { currency })
      .andWhere('rule.effectiveFrom <= :now', { now })
      .andWhere(
        new Brackets((nested) =>
          nested
            .where('rule.effectiveTo IS NULL')
            .orWhere('rule.effectiveTo > :now', { now }),
        ),
      );

    if (businessId) {
      query.andWhere(
        new Brackets((nested) =>
          nested
            .where('rule.businessId = :businessId', { businessId })
            .orWhere('rule.businessId IS NULL'),
        ),
      );
    } else {
      query.andWhere('rule.businessId IS NULL');
    }
    if (params.zoneId) {
      query.andWhere(
        new Brackets((nested) =>
          nested
            .where('rule.zoneId = :zoneId', { zoneId: params.zoneId })
            .orWhere('rule.zoneId IS NULL'),
        ),
      );
    } else {
      query.andWhere('rule.zoneId IS NULL');
    }

    query
      .orderBy(
        `CASE
          WHEN rule.businessId = :businessId AND rule.zoneId = :zoneId THEN 0
          WHEN rule.businessId = :businessId AND rule.zoneId IS NULL THEN 1
          WHEN rule.businessId IS NULL AND rule.zoneId = :zoneId THEN 2
          ELSE 3
        END`,
        'ASC',
      )
      .addOrderBy('rule.priority', 'DESC')
      .addOrderBy('rule.effectiveFrom', 'DESC')
      .addOrderBy('rule.id', 'ASC')
      .setParameters({
        businessId,
        zoneId: params.zoneId ?? null,
      })
      .take(1);

    const rule = await query.getOne();
    if (!rule) {
      throw new NotFoundException(
        'No pricing rule found for given zone/business',
      );
    }

    const baseFee = parseMoney(rule.baseFee, 'baseFee');
    const zoneSurcharge = parseMoney(rule.zoneSurcharge, 'zoneSurcharge');
    const perKmFee =
      rule.perKm && params.distanceKm !== undefined
        ? multiplyAndRoundHalfUp(
            parseMoney(rule.perKm, 'perKm'),
            decimalToScaled(params.distanceKm, 6, 'distanceKm'),
            1_000_000n,
          )
        : 0n;
    const codFee =
      rule.codFeePercent && params.codAmount
        ? multiplyAndRoundHalfUp(
            parseMoney(params.codAmount, 'codAmount'),
            decimalToScaled(rule.codFeePercent, 2, 'codFeePercent'),
            10_000n,
          )
        : 0n;
    const totalFee = baseFee + zoneSurcharge + perKmFee + codFee;
    parseMoney(totalFee.toString(), 'totalFee');

    return {
      baseFee: baseFee.toString(),
      zoneSurcharge: zoneSurcharge.toString(),
      perKmFee: perKmFee.toString(),
      codFee: codFee.toString(),
      totalFee: totalFee.toString(),
      currency,
      pricingRuleId: rule.id,
      pricingRuleEffectiveFrom: rule.effectiveFrom.toISOString(),
    };
  }

  private validateMoneyFields(
    dto: Partial<
      Pick<CreatePricingRuleDto, 'baseFee' | 'perKm' | 'zoneSurcharge'>
    >,
  ): void {
    if (dto.baseFee !== undefined) parseMoney(dto.baseFee, 'baseFee');
    if (dto.perKm !== undefined) parseMoney(dto.perKm, 'perKm');
    if (dto.zoneSurcharge !== undefined) {
      parseMoney(dto.zoneSurcharge, 'zoneSurcharge');
    }
  }

  private assertEffectiveRange(from?: string, to?: string): void {
    if (from && to && new Date(to) <= new Date(from)) {
      throw new BadRequestException('effectiveTo must be after effectiveFrom');
    }
  }

  private async assertZoneCompatible(
    zoneId: string | null,
    businessId: string | null,
  ): Promise<void> {
    if (!zoneId) return;
    const zone = await this.zoneRepo.findOne({
      where: { id: zoneId, active: true },
    });
    if (!zone)
      throw new BadRequestException('Zone is inactive or does not exist');
    if (zone.businessId && zone.businessId !== businessId) {
      throw new ForbiddenException(
        'Pricing rule cannot use another business zone',
      );
    }
  }

  private async assertCanRead(
    userId: string,
    businessId: string | null,
  ): Promise<void> {
    if (businessId) {
      await this.assertBusinessMember(userId, businessId, false);
      return;
    }
    await this.assertPlatformAdmin(userId, true);
  }

  private async assertCanManage(
    userId: string,
    businessId: string | null,
  ): Promise<void> {
    if (businessId) {
      await this.assertBusinessMember(userId, businessId, true);
      return;
    }
    await this.assertPlatformAdmin(userId, false);
  }

  private async assertBusinessActive(businessId: string): Promise<void> {
    const business = await this.businessRepo.findOne({
      where: { id: businessId },
    });
    if (!business) throw new NotFoundException('Business not found');
    if (business.status === BusinessStatus.SUSPENDED) {
      throw new ForbiddenException('Business is suspended');
    }
  }

  private async assertBusinessMember(
    userId: string,
    businessId: string,
    manage: boolean,
  ): Promise<void> {
    const member = await this.memberRepo.findOne({
      where: {
        userId,
        businessId,
        status: BusinessMemberStatus.ACTIVE,
        deletedAt: IsNull(),
      },
    });
    if (!member) {
      throw new NotFoundException('Pricing rule not found or access denied');
    }
    if (
      manage &&
      ![BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER].includes(
        member.role,
      )
    ) {
      throw new ForbiddenException('Business role cannot manage pricing');
    }
  }

  private async assertPlatformAdmin(
    userId: string,
    allowSupport: boolean,
  ): Promise<void> {
    const roles = allowSupport
      ? [AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.SUPPORT]
      : [AdminRole.SUPER_ADMIN, AdminRole.ADMIN];
    const assignment = await this.adminRepo.findOne({
      where: roles.map((role) => ({ userId, role, active: true })),
    });
    if (!assignment) {
      throw new ForbiddenException('Platform pricing requires an admin role');
    }
  }
}
