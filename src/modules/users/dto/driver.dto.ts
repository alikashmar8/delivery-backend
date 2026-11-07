import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { DriverAvailability } from '../entities/driver-profile.entity';

export class CreateDriverProfileDto {
  @ApiProperty({ minLength: 1, maxLength: 50, example: 'motorcycle' })
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  vehicleType!: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 20, example: 'BEI-1234' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  vehiclePlate?: string;

  @ApiPropertyOptional({ minLength: 1, maxLength: 50 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  license?: string;
}

export class SetDriverActiveDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  active!: boolean;

  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class SetMyAvailabilityDto {
  @ApiProperty({
    enum: [DriverAvailability.OFFLINE, DriverAvailability.ONLINE],
    example: DriverAvailability.ONLINE,
    description: 'on_delivery is system-controlled by later assignment work.',
  })
  @IsIn([DriverAvailability.OFFLINE, DriverAvailability.ONLINE])
  availability!: DriverAvailability.OFFLINE | DriverAvailability.ONLINE;

  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}

export class ListDriversQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: DriverAvailability })
  @IsOptional()
  @IsEnum(DriverAvailability)
  availability?: DriverAvailability;
}
