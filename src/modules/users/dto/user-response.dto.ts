import { ApiProperty } from '@nestjs/swagger';
import { DriverProfile } from '../entities/driver-profile.entity';
import { DriverProfileResponseDto } from './driver-response.dto';
import { User } from '../entities/user.entity';

export class AuthenticatedUserResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: '+96170123456' })
  phone!: string;

  @ApiProperty({ type: String, nullable: true, format: 'email' })
  email!: string | null;

  @ApiProperty()
  displayName!: string;

  @ApiProperty()
  status!: string;

  @ApiProperty()
  locale!: string;

  @ApiProperty({ example: 'LB' })
  country!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class UserSummaryResponseDto extends AuthenticatedUserResponseDto {
  @ApiProperty({
    type: () => DriverProfileResponseDto,
    nullable: true,
  })
  driverProfile!: DriverProfileResponseDto | null;
}

export function toAuthenticatedUserResponse(
  user: User,
): AuthenticatedUserResponseDto {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    displayName: user.displayName,
    status: user.status,
    locale: user.locale,
    country: user.country,
    createdAt: user.createdAt,
  };
}

export function toUserSummaryResponse(
  user: User,
  driverProfile: DriverProfile | null,
): UserSummaryResponseDto {
  return {
    ...toAuthenticatedUserResponse(user),
    driverProfile: driverProfile
      ? {
          id: driverProfile.id,
          userId: driverProfile.userId,
          vehicleType: driverProfile.vehicleType,
          vehiclePlate: driverProfile.vehiclePlate,
          availability: driverProfile.availability,
          active: driverProfile.active,
          version: driverProfile.version,
          createdAt: driverProfile.createdAt,
          updatedAt: driverProfile.updatedAt,
        }
      : null,
  };
}
