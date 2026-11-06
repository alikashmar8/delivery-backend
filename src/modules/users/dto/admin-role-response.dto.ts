import { ApiProperty } from '@nestjs/swagger';
import {
  AdminRole,
  AdminRoleAssignment,
} from '../entities/admin-role-assignment.entity';

export class AdminRoleAssignmentResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: AdminRole })
  role!: AdminRole;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ format: 'uuid', nullable: true })
  grantedById!: string | null;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class AdminRolesResponseDto {
  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ enum: AdminRole, isArray: true })
  roles!: AdminRole[];

  @ApiProperty({ type: () => AdminRoleAssignmentResponseDto, isArray: true })
  assignments!: AdminRoleAssignmentResponseDto[];

  @ApiProperty({ description: 'Whether persisted role state changed.' })
  changed!: boolean;
}

export function toAdminRoleAssignmentResponse(
  assignment: AdminRoleAssignment,
): AdminRoleAssignmentResponseDto {
  return {
    id: assignment.id,
    userId: assignment.userId,
    role: assignment.role,
    active: assignment.active,
    grantedById: assignment.grantedById,
    createdAt: assignment.createdAt,
    updatedAt: assignment.updatedAt,
  };
}

export function toAdminRolesResponse(
  userId: string,
  assignments: AdminRoleAssignment[],
  changed: boolean,
): AdminRolesResponseDto {
  const sorted = [...assignments].sort((left, right) =>
    left.role.localeCompare(right.role),
  );

  return {
    userId,
    roles: sorted.map((assignment) => assignment.role),
    assignments: sorted.map(toAdminRoleAssignmentResponse),
    changed,
  };
}
