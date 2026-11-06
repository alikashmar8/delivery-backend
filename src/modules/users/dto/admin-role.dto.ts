import { ApiProperty } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsEnum } from 'class-validator';
import { AdminRole } from '../entities/admin-role-assignment.entity';

export class UpdateAdminRolesDto {
  @ApiProperty({
    description: 'The complete desired set of active platform roles.',
    enum: AdminRole,
    isArray: true,
    example: [AdminRole.ADMIN, AdminRole.SUPPORT],
  })
  @IsArray()
  @ArrayUnique()
  @IsEnum(AdminRole, { each: true })
  roles!: AdminRole[];
}
