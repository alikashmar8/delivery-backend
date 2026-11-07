import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '../entities/user.entity';
import {
  DriverAvailability,
  DriverProfile,
} from '../entities/driver-profile.entity';

export class DriverProfileResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  userId!: string;

  @ApiProperty({ maxLength: 50 })
  vehicleType!: string;

  @ApiProperty({ type: String, maxLength: 20, nullable: true })
  vehiclePlate!: string | null;

  @ApiProperty({ enum: DriverAvailability })
  availability!: DriverAvailability;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ minimum: 1 })
  version!: number;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class DriverOperationResponseDto extends DriverProfileResponseDto {
  @ApiProperty()
  changed!: boolean;
}

export class DriverListUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Nour Haddad' })
  displayName!: string;

  @ApiProperty({ example: '+96170123456' })
  phone!: string;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;
}

export class DriverListItemResponseDto extends DriverProfileResponseDto {
  @ApiProperty({ type: () => DriverListUserResponseDto, nullable: true })
  user!: DriverListUserResponseDto | null;
}

export class PaginatedDriverListResponseDto {
  @ApiProperty({ type: () => [DriverListItemResponseDto] })
  items!: DriverListItemResponseDto[];

  @ApiProperty({ example: 20 })
  take!: number;

  @ApiProperty({ example: 0 })
  skip!: number;
}

export function toDriverProfileResponse(
  profile: DriverProfile,
): DriverProfileResponseDto {
  return {
    id: profile.id,
    userId: profile.userId,
    vehicleType: profile.vehicleType,
    vehiclePlate: profile.vehiclePlate,
    availability: profile.availability,
    active: profile.active,
    version: profile.version,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export function toDriverOperationResponse(
  profile: DriverProfile,
  changed: boolean,
): DriverOperationResponseDto {
  return { ...toDriverProfileResponse(profile), changed };
}

export function toDriverListItemResponse(
  profile: DriverProfile,
  user: DriverListUserResponseDto | null,
): DriverListItemResponseDto {
  return { ...toDriverProfileResponse(profile), user };
}
