import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import type { AuditRequestContext } from '../audit/audit-request-context';
import {
  AdminRole,
  AdminRoleAssignment,
} from './entities/admin-role-assignment.entity';
import { DriverProfile } from './entities/driver-profile.entity';
import { User, UserStatus } from './entities/user.entity';
import {
  toUserSummaryResponse,
  UserSummaryResponseDto,
} from './dto/user-response.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(DriverProfile)
    private readonly driverRepo: Repository<DriverProfile>,
    @InjectRepository(AdminRoleAssignment)
    private readonly adminRoleRepo: Repository<AdminRoleAssignment>,
    private readonly auditService: AuditService,
  ) {}

  async findById(id: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByPhone(phone: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { phone } });
  }

  async findDriverProfile(userId: string): Promise<DriverProfile | null> {
    return this.driverRepo.findOne({ where: { userId } });
  }

  async findUserSummary(id: string): Promise<UserSummaryResponseDto> {
    const [user, dp] = await Promise.all([
      this.userRepo.findOne({ where: { id } }),
      this.driverRepo.findOne({ where: { userId: id } }),
    ]);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return toUserSummaryResponse(user, dp);
  }

  async suspend(id: string): Promise<User> {
    const user = await this.findById(id);
    user.status = UserStatus.SUSPENDED;
    return await this.userRepo.save(user);
  }

  async restore(id: string): Promise<User> {
    const user = await this.findById(id);
    user.status = UserStatus.ACTIVE;
    return await this.userRepo.save(user);
  }

  async softDelete(id: string): Promise<void> {
    const user = await this.findById(id);
    user.status = UserStatus.DELETED;
    await this.userRepo.softRemove(user);
  }

  async updateAdminRoles(
    actorId: string,
    targetUserId: string,
    desiredRoles: AdminRole[],
    auditContext?: AuditRequestContext,
  ): Promise<{
    assignments: AdminRoleAssignment[];
    changed: boolean;
  }> {
    return await this.adminRoleRepo.manager.transaction(async (manager) => {
      // The final-super-admin invariant spans users. Role mutations are rare,
      // so a transaction-scoped advisory lock keeps this critical section
      // simple and prevents concurrent role changes from removing all admins.
      await manager.query('SELECT pg_advisory_xact_lock($1)', [734051]);

      const adminRoles = manager.getRepository(AdminRoleAssignment);
      const actorRole = await adminRoles.findOne({
        where: {
          userId: actorId,
          role: AdminRole.SUPER_ADMIN,
          active: true,
        },
      });
      if (!actorRole) {
        throw new ForbiddenException('Active super-admin role required');
      }

      const targetUser = await manager.getRepository(User).findOne({
        where: { id: targetUserId },
        withDeleted: true,
        lock: { mode: 'pessimistic_write' },
      });
      if (!targetUser) {
        throw new NotFoundException('User not found');
      }

      const assignments = await adminRoles.find({
        where: { userId: targetUserId },
        order: { role: 'ASC' },
      });
      const desired = new Set(desiredRoles);
      const byRole = new Map(
        assignments.map((assignment) => [assignment.role, assignment]),
      );
      const activeRoles = new Set(
        assignments
          .filter((assignment) => assignment.active)
          .map((assignment) => assignment.role),
      );

      const additions = [...desired].filter((role) => !activeRoles.has(role));
      if (targetUser.status !== UserStatus.ACTIVE && additions.length > 0) {
        throw new ForbiddenException(
          'Admin roles can only be granted to active users',
        );
      }

      const currentlyHasSuperAdmin = activeRoles.has(AdminRole.SUPER_ADMIN);
      const willHaveSuperAdmin = desired.has(AdminRole.SUPER_ADMIN);
      if (currentlyHasSuperAdmin && !willHaveSuperAdmin) {
        const activeSuperAdminCount = await adminRoles.count({
          where: { role: AdminRole.SUPER_ADMIN, active: true },
        });
        if (activeSuperAdminCount <= 1) {
          throw new ConflictException(
            'The final active super-admin cannot be revoked',
          );
        }
      }

      const changes: Array<{
        assignment: AdminRoleAssignment;
        action: 'admin_role.grant' | 'admin_role.revoke';
        before: unknown;
      }> = [];
      const pending = new Set<AdminRoleAssignment>();

      for (const role of Object.values(AdminRole)) {
        const existing = byRole.get(role);
        const shouldBeActive = desired.has(role);

        if (shouldBeActive && !existing) {
          const assignment = adminRoles.create({
            userId: targetUserId,
            role,
            active: true,
            grantedById: actorId,
          });
          byRole.set(role, assignment);
          pending.add(assignment);
          changes.push({
            assignment,
            action: 'admin_role.grant',
            before: null,
          });
          continue;
        }

        if (!existing || existing.active === shouldBeActive) continue;

        const before = this.adminRoleSnapshot(existing);
        existing.active = shouldBeActive;
        if (shouldBeActive) existing.grantedById = actorId;
        pending.add(existing);
        changes.push({
          assignment: existing,
          action: shouldBeActive ? 'admin_role.grant' : 'admin_role.revoke',
          before,
        });
      }

      if (pending.size > 0) {
        const saved = await adminRoles.save([...pending]);
        for (const assignment of saved) byRole.set(assignment.role, assignment);
      }

      if (changes.length > 0) {
        await this.auditService.recordManyWithManager(
          manager,
          changes.map(({ assignment, action, before }) => ({
            actorId,
            action,
            entityType: 'AdminRoleAssignment',
            entityId: assignment.id,
            options: {
              before,
              after: this.adminRoleSnapshot(assignment),
              ipAddress: auditContext?.ipAddress,
              userAgent: auditContext?.userAgent,
            },
          })),
        );
      }

      return {
        assignments: [...byRole.values()].filter(
          (assignment) => assignment.active && desired.has(assignment.role),
        ),
        changed: changes.length > 0,
      };
    });
  }

  private adminRoleSnapshot(assignment: AdminRoleAssignment) {
    return {
      id: assignment.id,
      userId: assignment.userId,
      role: assignment.role,
      active: assignment.active,
      grantedById: assignment.grantedById,
    };
  }
}
