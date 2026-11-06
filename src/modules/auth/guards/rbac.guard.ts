import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  AdminRole,
  AdminRoleAssignment,
} from '../../users/entities/admin-role-assignment.entity';

export const ROLES_KEY = 'roles';
export const RequiredRoles = (...roles: AdminRole[]) =>
  SetMetadata(ROLES_KEY, roles);

@Injectable()
export class RBACGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(AdminRoleAssignment)
    private readonly adminRepo: Repository<AdminRoleAssignment>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<AdminRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No roles required = access allowed
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authUser = request.user;
    if (!authUser?.sub) {
      throw new ForbiddenException('Not authenticated');
    }

    // Super admins are platform-wide; admin and support remain separate
    // capabilities. This keeps future routes safe when they name only the
    // narrower capability they need.
    const effectiveRoles = [
      ...new Set([...requiredRoles, AdminRole.SUPER_ADMIN]),
    ];

    const hasRequiredRole = await this.adminRepo.exists({
      where: {
        userId: authUser.sub,
        active: true,
        role: In(effectiveRoles),
      },
    });

    if (hasRequiredRole) {
      return true;
    }

    throw new ForbiddenException('Insufficient permissions');
  }
}
