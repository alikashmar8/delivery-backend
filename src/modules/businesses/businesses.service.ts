import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { AuditService } from '../audit/audit.service';
import type { AuditRequestContext } from '../audit/audit-request-context';
import {
  BusinessResponseDto,
  toBusinessResponse,
} from './dto/business-response.dto';
import {
  BusinessMember,
  BusinessMemberRole,
  BusinessMemberStatus,
} from './entities/business-member.entity';
import { Business, BusinessStatus } from './entities/business.entity';

@Injectable()
export class BusinessesService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(BusinessMember)
    private readonly memberRepo: Repository<BusinessMember>,
    @Optional() private readonly auditService?: AuditService,
  ) {}

  async create(
    ownerId: string,
    data: {
      name: string;
      slug: string;
      contactPhone: string;
      legalName?: string;
    },
  ): Promise<Business> {
    return await this.dataSource.transaction(async (manager) => {
      const businessRepo = manager.getRepository(Business);
      const memberRepo = manager.getRepository(BusinessMember);
      const existing = await businessRepo.findOne({
        where: { slug: data.slug },
      });
      if (existing) throw new ConflictException('Business slug already taken');

      const business = await businessRepo.save(
        businessRepo.create({
          name: data.name,
          slug: data.slug,
          contactPhone: data.contactPhone,
          legalName: data.legalName ?? null,
        }),
      );
      await memberRepo.save(
        memberRepo.create({
          businessId: business.id,
          userId: ownerId,
          role: BusinessMemberRole.OWNER,
          status: BusinessMemberStatus.ACTIVE,
        }),
      );
      return business;
    });
  }

  async findById(id: string): Promise<Business> {
    const business = await this.businessRepo.findOne({ where: { id } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  async findBySlug(slug: string): Promise<Business> {
    const business = await this.businessRepo.findOne({ where: { slug } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  async findUserBusinesses(userId: string, page: PaginationQueryDto) {
    // S06: Filter Business eligibility in SQL BEFORE pagination to avoid premature empty pages.
    // Use a WHERE clause to enforce ACTIVE business status before LIMIT/OFFSET.
    const memberships = await this.memberRepo
      .createQueryBuilder('member')
      .innerJoinAndSelect('member.business', 'business')
      .where('member.userId = :userId', { userId })
      .andWhere('member.status = :memberStatus', {
        memberStatus: BusinessMemberStatus.ACTIVE,
      })
      .andWhere('member.deletedAt IS NULL')
      .andWhere('business.status = :businessStatus', {
        businessStatus: BusinessStatus.ACTIVE,
      })
      .orderBy('member.createdAt', 'DESC')
      .addOrderBy('member.id', 'DESC')
      .take(page.take)
      .skip(page.skip)
      .getMany();

    // Map memberships to business response objects.
    return memberships.map((m) => ({
      id: m.business!.id,
      name: m.business!.name,
      slug: m.business!.slug,
      role: m.role,
      status: m.business!.status,
      country: m.business!.country,
      currency: m.business!.currency,
      contactPhone: m.business!.contactPhone,
      legalName: m.business!.legalName,
      createdAt: m.business!.createdAt,
    }));
  }

  async findSummaryById(id: string): Promise<BusinessResponseDto> {
    return toBusinessResponse(await this.findById(id));
  }

  async addMember(
    businessId: string,
    userId: string,
    role: BusinessMemberRole,
    addedById: string,
    auditContext?: AuditRequestContext,
  ): Promise<BusinessMember> {
    await this.assertBusinessActive(businessId, this.businessRepo);
    const actor = await this.assertMember(businessId, addedById);
    if (
      actor.role !== BusinessMemberRole.OWNER &&
      actor.role !== BusinessMemberRole.MANAGER
    ) {
      throw new ForbiddenException('Only owners and managers can add members');
    }

    const existing = await this.memberRepo.findOne({
      where: { businessId, userId, deletedAt: IsNull() },
    });
    if (existing) {
      throw new ConflictException('User is already a member of this business');
    }

    // S05: persist the membership and its audit entry atomically so a
    // failed transaction leaves neither an unaudited mutation nor a false
    // success audit. The snapshot carries only membership fields (no secrets).
    return await this.dataSource.transaction(async (manager) => {
      const memberRepo = manager.getRepository(BusinessMember);
      const membership = await memberRepo.save(
        memberRepo.create({
          businessId,
          userId,
          role,
          status: BusinessMemberStatus.ACTIVE,
        }),
      );
      if (this.auditService) {
        await this.auditService.recordWithManager(
          manager,
          addedById,
          'member.add',
          'BusinessMember',
          membership.id,
          {
            businessId,
            before: null,
            after: {
              businessId: membership.businessId,
              userId: membership.userId,
              role: membership.role,
              status: membership.status,
            },
            ...auditContext,
          },
        );
      }
      return membership;
    });
  }

  async removeMember(
    businessId: string,
    userId: string,
    removedById: string,
    auditContext?: AuditRequestContext,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const businessRepo = manager.getRepository(Business);
      const memberRepo = manager.getRepository(BusinessMember);

      const business = await businessRepo.findOne({
        where: { id: businessId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!business) throw new NotFoundException('Business not found');
      if (business.status === BusinessStatus.SUSPENDED) {
        throw new ForbiddenException('Business is suspended');
      }

      const actor = await memberRepo.findOne({
        where: {
          businessId,
          userId: removedById,
          role: BusinessMemberRole.OWNER,
          status: BusinessMemberStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      });
      if (!actor) {
        throw new ForbiddenException('Only an active owner can remove members');
      }

      const membership = await memberRepo.findOne({
        where: { businessId, userId, deletedAt: IsNull() },
      });
      if (!membership) throw new NotFoundException('Membership not found');

      if (
        membership.role === BusinessMemberRole.OWNER &&
        membership.status === BusinessMemberStatus.ACTIVE
      ) {
        const ownerCount = await memberRepo.count({
          where: {
            businessId,
            role: BusinessMemberRole.OWNER,
            status: BusinessMemberStatus.ACTIVE,
            deletedAt: IsNull(),
          },
        });
        if (ownerCount <= 1) {
          throw new ForbiddenException('Cannot remove the last active owner');
        }
      }

      // S05: capture the pre-removal state before soft-deleting so the
      // audit entry records exactly what changed (no secrets involved).
      const before = {
        businessId: membership.businessId,
        userId: membership.userId,
        role: membership.role,
        status: membership.status,
      };
      membership.deletedAt = new Date();
      const removed = await memberRepo.save(membership);
      if (this.auditService) {
        await this.auditService.recordWithManager(
          manager,
          removedById,
          'member.remove',
          'BusinessMember',
          removed.id,
          {
            businessId,
            before,
            after: {
              ...before,
              deletedAt: removed.deletedAt,
            },
            ...auditContext,
          },
        );
      }
    });
  }

  async findMembers(
    businessId: string,
    page: PaginationQueryDto,
  ): Promise<BusinessMember[]> {
    return await this.memberRepo.find({
      where: {
        businessId,
        status: BusinessMemberStatus.ACTIVE,
        deletedAt: IsNull(),
      },
      order: { createdAt: 'ASC', id: 'ASC' },
      take: page.take,
      skip: page.skip,
    });
  }

  async suspend(id: string): Promise<Business> {
    const business = await this.findById(id);
    business.status = BusinessStatus.SUSPENDED;
    return this.businessRepo.save(business);
  }

  async restore(id: string): Promise<Business> {
    const business = await this.findById(id);
    business.status = BusinessStatus.ACTIVE;
    return this.businessRepo.save(business);
  }

  async assertMember(
    businessId: string,
    userId: string,
  ): Promise<BusinessMember> {
    const membership = await this.memberRepo.findOne({
      where: {
        businessId,
        userId,
        status: BusinessMemberStatus.ACTIVE,
        deletedAt: IsNull(),
      },
    });
    if (!membership) {
      throw new ForbiddenException('Not a member of this business');
    }
    return membership;
  }

  /**
   * S02: suspended businesses are ineligible for mutations. Reads stay
   * available for members/admin support; every business-scoped write must
   * call this before mutating. Uses the provided repository so transactional
   * callers pass their EntityManager repository.
   */
  private async assertBusinessActive(
    businessId: string,
    repository: Repository<Business>,
  ): Promise<Business> {
    const business = await repository.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');
    if (business.status === BusinessStatus.SUSPENDED) {
      throw new ForbiddenException('Business is suspended');
    }
    return business;
  }
}
