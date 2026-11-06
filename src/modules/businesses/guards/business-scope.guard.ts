import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { isUUID } from 'class-validator';
import { IsNull, Repository } from 'typeorm';
import {
  BusinessMember,
  BusinessMemberStatus,
} from '../entities/business-member.entity';
import { BusinessStatus } from '../entities/business.entity';

@Injectable()
export class BusinessScopeGuard implements CanActivate {
  constructor(
    @InjectRepository(BusinessMember)
    private readonly memberRepo: Repository<BusinessMember>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authUser = request.user;
    if (!authUser?.sub) {
      throw new ForbiddenException('Not authenticated');
    }

    // The requested resource identifies the scope. Headers/query/body may select
    // context, but are never accepted as proof of membership.
    const businessId = request.params.businessId ?? request.params.id;

    if (!businessId) {
      throw new ForbiddenException('Business scope is required');
    }
    if (typeof businessId !== 'string' || !isUUID(businessId)) {
      throw new NotFoundException('Business not found or access denied');
    }

    const membership = await this.memberRepo.findOne({
      where: {
        businessId,
        userId: authUser.sub,
        status: BusinessMemberStatus.ACTIVE,
        deletedAt: IsNull(),
      },
      relations: ['business'],
    });

    if (!membership) {
      throw new NotFoundException('Business not found or access denied');
    }

    // S02: suspended businesses are read-only for members. GET reads stay
    // available for history/support; every mutation requires an ACTIVE business.
    // Services re-check eligibility as defense in depth.
    const business = membership.business;
    if (!business) {
      throw new NotFoundException('Business not found or access denied');
    }
    const method = String(request.method ?? 'GET').toUpperCase();
    if (business.status === BusinessStatus.SUSPENDED && method !== 'GET') {
      throw new ForbiddenException('Business is suspended');
    }

    // Attach business context to request for downstream use
    (request as any).businessId = businessId;
    (request as any).businessRole = membership.role;

    return true;
  }
}
