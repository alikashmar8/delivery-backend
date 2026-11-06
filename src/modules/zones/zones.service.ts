import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
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
import { UpdateZoneDto } from './dto/zone.dto';
import { DeliveryZone } from './entities/delivery-zone.entity';

@Injectable()
export class ZonesService {
  constructor(
    @InjectRepository(DeliveryZone)
    private readonly repo: Repository<DeliveryZone>,
    @InjectRepository(BusinessMember)
    private readonly memberRepo: Repository<BusinessMember>,
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    @InjectRepository(AdminRoleAssignment)
    private readonly adminRepo: Repository<AdminRoleAssignment>,
  ) {}

  async create(
    actorUserId: string,
    dto: {
      name: string;
      businessId?: string | null;
      boundary: Record<string, unknown>;
      active?: boolean;
    },
  ): Promise<DeliveryZone> {
    const businessId = dto.businessId ?? null;
    if (businessId) await this.assertBusinessActive(businessId);
    await this.assertCanManage(actorUserId, businessId);
    await this.assertPostgisValid(dto.boundary);
    return await this.repo.save(
      this.repo.create({
        name: dto.name,
        businessId,
        boundary: dto.boundary,
        active: dto.active ?? true,
      }),
    );
  }

  async findAll(
    actorUserId: string,
    businessId: string | null,
    page: PaginationQueryDto,
  ): Promise<DeliveryZone[]> {
    await this.assertCanRead(actorUserId, businessId);
    return await this.repo.find({
      where: {
        businessId: businessId ? businessId : IsNull(),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: page.take,
      skip: page.skip,
    });
  }

  async findAuthorizedById(
    id: string,
    actorUserId: string,
  ): Promise<DeliveryZone> {
    const zone = await this.findById(id);
    await this.assertCanRead(actorUserId, zone.businessId);
    return zone;
  }

  async findById(id: string): Promise<DeliveryZone> {
    const zone = await this.repo.findOne({ where: { id } });
    if (!zone) throw new NotFoundException('Zone not found');
    return zone;
  }

  async findZoneForPoint(
    lng: number,
    lat: number,
    businessId?: string | null,
  ): Promise<DeliveryZone | null> {
    const result: Array<{ id: string }> = await this.repo.query(
      `SELECT id
         FROM delivery_zones
        WHERE active = true
          AND ST_Covers(boundary, ST_SetSRID(ST_MakePoint($1, $2), 4326))
          AND (
            ($3::uuid IS NULL AND "businessId" IS NULL)
            OR ($3::uuid IS NOT NULL AND ("businessId" = $3 OR "businessId" IS NULL))
          )
        ORDER BY
          CASE WHEN "businessId" = $3::uuid THEN 0 ELSE 1 END,
          "createdAt" DESC,
          id ASC
        LIMIT 1`,
      [lng, lat, businessId ?? null],
    );
    return result[0] ? await this.findById(result[0].id) : null;
  }

  async update(
    id: string,
    actorUserId: string,
    dto: UpdateZoneDto,
  ): Promise<DeliveryZone> {
    const zone = await this.findById(id);
    if (zone.businessId) await this.assertBusinessActive(zone.businessId);
    await this.assertCanManage(actorUserId, zone.businessId);
    if (dto.boundary) {
      await this.assertPostgisValid(dto.boundary);
      zone.boundary = dto.boundary;
    }
    if (dto.name !== undefined) zone.name = dto.name;
    if (dto.active !== undefined) zone.active = dto.active;
    return await this.repo.save(zone);
  }

  async remove(id: string, actorUserId: string): Promise<void> {
    const zone = await this.findById(id);
    if (zone.businessId) await this.assertBusinessActive(zone.businessId);
    await this.assertCanManage(actorUserId, zone.businessId);
    zone.active = false;
    await this.repo.save(zone);
  }

  private async assertPostgisValid(
    boundary: Record<string, unknown>,
  ): Promise<void> {
    try {
      const result: Array<{
        valid: boolean;
        geometryType: string;
        srid: number;
      }> = await this.repo.query(
        `SELECT ST_IsValid(geometry) AS valid,
                  GeometryType(geometry) AS "geometryType",
                  ST_SRID(geometry) AS srid
             FROM (
               SELECT ST_SetSRID(ST_GeomFromGeoJSON($1), 4326) AS geometry
             ) checked`,
        [JSON.stringify(boundary)],
      );
      if (
        !result[0]?.valid ||
        result[0].geometryType !== 'POLYGON' ||
        result[0].srid !== 4326
      ) {
        throw new BadRequestException(
          'Boundary must be a valid SRID 4326 Polygon',
        );
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Boundary is not valid GeoJSON');
    }
  }

  private async assertCanRead(
    actorUserId: string,
    businessId: string | null,
  ): Promise<void> {
    if (businessId) {
      await this.assertBusinessMember(actorUserId, businessId, false);
      return;
    }
    await this.assertPlatformAdmin(actorUserId, true);
  }

  private async assertCanManage(
    actorUserId: string,
    businessId: string | null,
  ): Promise<void> {
    if (businessId) {
      await this.assertBusinessMember(actorUserId, businessId, true);
      return;
    }
    await this.assertPlatformAdmin(actorUserId, false);
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
    if (!member) throw new NotFoundException('Zone not found or access denied');
    if (
      manage &&
      ![BusinessMemberRole.OWNER, BusinessMemberRole.MANAGER].includes(
        member.role,
      )
    ) {
      throw new ForbiddenException('Business role cannot manage zones');
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
      throw new ForbiddenException(
        'Platform zone access requires an admin role',
      );
    }
  }
}
