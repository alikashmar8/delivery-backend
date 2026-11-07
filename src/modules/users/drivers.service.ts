import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import type { AuditRequestContext } from '../audit/audit-request-context';
import { AuditService } from '../audit/audit.service';
import {
  Delivery,
  ACTIVE_DRIVER_DELIVERY_STATUSES,
} from '../deliveries/entities/delivery.entity';
import { User, UserStatus } from './entities/user.entity';
import {
  AdminRole,
  AdminRoleAssignment,
} from './entities/admin-role-assignment.entity';
import {
  DriverAvailability,
  DriverProfile,
} from './entities/driver-profile.entity';
import type {
  CreateDriverProfileDto,
  ListDriversQueryDto,
} from './dto/driver.dto';
import type { DriverListUserResponseDto } from './dto/driver-response.dto';

export interface DriverListItem {
  profile: DriverProfile;
  user: DriverListUserResponseDto | null;
}

export interface DriverMutationResult {
  profile: DriverProfile;
  changed: boolean;
}

/**
 * C04 operational driver capability. This deliberately does not assign a
 * delivery or transition delivery state; later delivery workflow stages own
 * those mutations.
 */
@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(DriverProfile)
    private readonly driverRepo: Repository<DriverProfile>,
    @InjectRepository(AdminRoleAssignment)
    private readonly adminRoleRepo: Repository<AdminRoleAssignment>,
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
    private readonly auditService: AuditService,
  ) {}

  async createProfile(
    actorId: string,
    targetUserId: string,
    dto: CreateDriverProfileDto,
    auditContext?: AuditRequestContext,
  ): Promise<DriverProfile> {
    return await this.driverRepo.manager.transaction(async (manager) => {
      await this.assertActiveDriverOperator(manager, actorId);

      const users = manager.getRepository(User);
      const profiles = manager.getRepository(DriverProfile);
      const target = await users.findOne({
        where: { id: targetUserId },
        withDeleted: true,
        lock: { mode: 'pessimistic_write' },
      });
      if (!target) throw new NotFoundException('User not found');
      if (target.status !== UserStatus.ACTIVE || target.deletedAt) {
        throw new ForbiddenException(
          'Driver profiles can only be created for active users',
        );
      }

      const existing = await profiles.findOne({
        where: { userId: targetUserId },
      });
      if (existing) {
        throw new ConflictException('User already has a driver profile');
      }

      const profile = await profiles.save(
        profiles.create({
          userId: targetUserId,
          vehicleType: dto.vehicleType,
          vehiclePlate: dto.vehiclePlate ?? null,
          license: dto.license ?? null,
          active: false,
          availability: DriverAvailability.OFFLINE,
          version: 1,
        }),
      );

      await this.auditService.recordWithManager(
        manager,
        actorId,
        'driver.onboard',
        'DriverProfile',
        profile.id,
        {
          after: this.snapshot(profile),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      );
      return profile;
    });
  }

  async setActive(
    actorId: string,
    driverId: string,
    active: boolean,
    expectedVersion: number,
    auditContext?: AuditRequestContext,
  ): Promise<DriverMutationResult> {
    return await this.driverRepo.manager.transaction(async (manager) => {
      await this.assertActiveDriverOperator(manager, actorId);

      const profiles = manager.getRepository(DriverProfile);
      const profile = await profiles.findOne({
        where: { id: driverId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile) throw new NotFoundException('Driver profile not found');
      this.assertExpectedVersion(profile, expectedVersion);

      const nextAvailability = active
        ? profile.availability
        : DriverAvailability.OFFLINE;
      if (
        profile.active === active &&
        profile.availability === nextAvailability
      ) {
        return { profile, changed: false };
      }

      if (active) {
        const target = await manager.getRepository(User).findOne({
          where: { id: profile.userId },
          withDeleted: true,
          lock: { mode: 'pessimistic_write' },
        });
        if (
          !target ||
          target.status !== UserStatus.ACTIVE ||
          target.deletedAt
        ) {
          throw new ForbiddenException(
            'Only an active user can be approved as a driver',
          );
        }
      }

      const before = this.snapshot(profile);
      const result = await profiles.update(
        { id: profile.id, version: expectedVersion },
        {
          active,
          availability: nextAvailability,
          version: expectedVersion + 1,
        },
      );
      if (result.affected !== 1) {
        throw new ConflictException(
          'Driver profile was modified by another request',
        );
      }
      const updated = await profiles.findOne({ where: { id: profile.id } });
      if (!updated) throw new NotFoundException('Driver profile not found');

      await this.auditService.recordWithManager(
        manager,
        actorId,
        active ? 'driver.activate' : 'driver.deactivate',
        'DriverProfile',
        updated.id,
        {
          before,
          after: this.snapshot(updated),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      );
      return { profile: updated, changed: true };
    });
  }

  async setMyAvailability(
    userId: string,
    availability: DriverAvailability,
    expectedVersion: number,
    auditContext?: AuditRequestContext,
  ): Promise<DriverMutationResult> {
    if (
      availability !== DriverAvailability.OFFLINE &&
      availability !== DriverAvailability.ONLINE
    ) {
      throw new BadRequestException(
        'Only online or offline availability may be set by a driver',
      );
    }

    return await this.driverRepo.manager.transaction(async (manager) => {
      const profiles = manager.getRepository(DriverProfile);
      const profile = await profiles.findOne({
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!profile || !profile.active) {
        throw new ForbiddenException('Driver approval is required');
      }
      this.assertExpectedVersion(profile, expectedVersion);
      if (profile.availability === availability) {
        return { profile, changed: false };
      }

      if (profile.availability === DriverAvailability.ON_DELIVERY) {
        throw new ConflictException(
          'Availability is system-controlled while assigned',
        );
      }
      const before = this.snapshot(profile);
      const result = await profiles.update(
        { id: profile.id, version: expectedVersion },
        { availability, version: expectedVersion + 1 },
      );
      if (result.affected !== 1) {
        throw new ConflictException(
          'Driver profile was modified by another request',
        );
      }
      const updated = await profiles.findOne({ where: { id: profile.id } });
      if (!updated) throw new NotFoundException('Driver profile not found');

      await this.auditService.recordWithManager(
        manager,
        userId,
        'driver.availability.update',
        'DriverProfile',
        updated.id,
        {
          before,
          after: this.snapshot(updated),
          ipAddress: auditContext?.ipAddress,
          userAgent: auditContext?.userAgent,
        },
      );
      return { profile: updated, changed: true };
    });
  }

  async findMyProfile(userId: string): Promise<DriverProfile> {
    const profile = await this.driverRepo.findOne({ where: { userId } });
    if (!profile) throw new NotFoundException('Driver profile not found');
    return profile;
  }

  async listDrivers(query: ListDriversQueryDto): Promise<DriverListItem[]> {
    const profiles = await this.driverRepo.find({
      where: query.availability
        ? { availability: query.availability }
        : undefined,
      order: { createdAt: 'DESC', id: 'DESC' },
      take: query.take,
      skip: query.skip,
    });
    if (profiles.length === 0) return [];

    // Bounded profile and user reads avoid an N+1 query while deliberately
    // selecting only the user fields needed by the operations list.
    const users = await this.userRepo.find({
      where: { id: In(profiles.map((profile) => profile.userId)) },
      select: { id: true, displayName: true, phone: true, status: true },
    });
    const byId = new Map(users.map((user) => [user.id, user]));
    return profiles.map((profile) => {
      const user = byId.get(profile.userId);
      return {
        profile,
        user: user
          ? {
              id: user.id,
              displayName: user.displayName,
              phone: user.phone,
              status: user.status,
            }
          : null,
      };
    });
  }

  async listMyQueue(
    userId: string,
    take: number,
    skip: number,
  ): Promise<Delivery[]> {
    const profile = await this.driverRepo.findOne({
      where: { userId, active: true },
    });
    if (!profile) throw new ForbiddenException('Driver approval is required');

    return await this.deliveryRepo.find({
      where: {
        driverId: profile.id,
        status: In(ACTIVE_DRIVER_DELIVERY_STATUSES),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      take,
      skip,
    });
  }

  private async assertActiveDriverOperator(
    manager: EntityManager,
    actorId: string,
  ): Promise<void> {
    const actor = await manager.getRepository(User).findOne({
      where: { id: actorId },
      select: { id: true, status: true },
    });
    if (!actor || actor.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('Active admin role required');
    }
    const hasRole = await manager.getRepository(AdminRoleAssignment).exists({
      where: {
        userId: actorId,
        active: true,
        role: In([AdminRole.SUPER_ADMIN, AdminRole.ADMIN]),
      },
    });
    if (!hasRole) throw new ForbiddenException('Active admin role required');
  }

  private assertExpectedVersion(
    profile: DriverProfile,
    expectedVersion: number,
  ): void {
    if (profile.version !== expectedVersion) {
      throw new ConflictException(
        'Driver profile was modified by another request',
      );
    }
  }

  private snapshot(profile: DriverProfile) {
    return {
      id: profile.id,
      userId: profile.userId,
      vehicleType: profile.vehicleType,
      vehiclePlate: profile.vehiclePlate,
      availability: profile.availability,
      active: profile.active,
      version: profile.version,
    };
  }
}
