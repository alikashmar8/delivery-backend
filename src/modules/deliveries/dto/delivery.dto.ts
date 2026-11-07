import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPhoneNumber,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';
import { DeliveryStatus, PaymentMethod } from '../entities/delivery.entity';

const MONEY_PATTERN = /^(0|[1-9]\d*)$/;

export class RecipientDto {
  @ApiProperty({ example: 'Sara Haddad', minLength: 1, maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
  @ApiProperty({ example: '+96170123456', maxLength: 20 })
  @IsPhoneNumber()
  @MaxLength(20)
  phone!: string;
  @ApiPropertyOptional({ minLength: 2, maxLength: 2, example: 'LB' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  regionId?: string;
  @ApiProperty({ example: 'Beirut', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  street?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  building?: string;
  @ApiPropertyOptional({ maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  floor?: string;
  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  apartment?: string;
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  landmark?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;
  @ApiProperty({ minimum: -90, maximum: 90, example: 33.8938 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;
  @ApiProperty({ minimum: -180, maximum: 180, example: 35.5018 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
}

export class PickupAddressDto {
  @ApiPropertyOptional({ minLength: 2, maxLength: 2, example: 'LB' })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  regionId?: string;
  @ApiProperty({ example: 'Beirut', minLength: 1, maxLength: 100 })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  city!: string;
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  street?: string;
  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  building?: string;
  @ApiPropertyOptional({ maxLength: 10 })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  floor?: string;
  @ApiPropertyOptional({ maxLength: 20 })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  apartment?: string;
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  landmark?: string;
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instructions?: string;
  @ApiProperty({ minimum: -90, maximum: 90, example: 33.8938 })
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude!: number;
  @ApiProperty({ minimum: -180, maximum: 180, example: 35.5018 })
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude!: number;
  @ApiPropertyOptional({ maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  contactName?: string;
  @ApiPropertyOptional({ maxLength: 20, example: '+96170123456' })
  @IsOptional()
  @IsPhoneNumber()
  @MaxLength(20)
  contactPhone?: string;
}

export class CreateDeliveryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  businessId?: string;
  @ApiPropertyOptional({ enum: PaymentMethod, default: PaymentMethod.COD })
  @IsOptional()
  @IsEnum(PaymentMethod)
  paymentMethod?: PaymentMethod;
  @ApiPropertyOptional({ enum: ['USD'] })
  @IsOptional()
  @IsIn(['USD'])
  currency?: string;
  @ApiPropertyOptional({
    pattern: '^(0|[1-9]\\d*)$',
    description: 'Integer minor units, never a decimal amount',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'codAmount must be integer minor units' })
  codAmount?: string;
  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  notes?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 100000, multipleOf: 0.000001 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(100_000)
  distanceKm?: number;

  @ApiProperty({ type: () => RecipientDto })
  @IsNotEmpty({ message: 'recipient is required' })
  @IsObject({ message: 'recipient must be an object' })
  @ValidateNested()
  @Type(() => RecipientDto)
  recipient!: RecipientDto;

  @ApiProperty({ type: () => PickupAddressDto })
  @IsNotEmpty({ message: 'pickupAddress is required' })
  @IsObject({ message: 'pickupAddress must be an object' })
  @ValidateNested()
  @Type(() => PickupAddressDto)
  pickupAddress!: PickupAddressDto;
}

export enum CancellationReason {
  SENDER_REQUEST = 'sender_request',
  DUPLICATE = 'duplicate',
  INVALID_ADDRESS = 'invalid_address',
  OPERATIONAL = 'operational',
}

export class TransitionDeliveryDto {
  @ApiProperty({ enum: DeliveryStatus })
  @IsEnum(DeliveryStatus)
  toStatus!: DeliveryStatus;

  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiPropertyOptional({ minLength: 1, maxLength: 100 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  reason?: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;
}

export class CancelDeliveryDto {
  @ApiProperty({ minimum: 1, example: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
  @ApiProperty({ enum: CancellationReason })
  @IsEnum(CancellationReason)
  reason!: CancellationReason;
}

export class ListDeliveriesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  businessId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  driverId?: string;
  @ApiPropertyOptional({ enum: DeliveryStatus })
  @IsOptional()
  @IsEnum(DeliveryStatus)
  status?: DeliveryStatus;
}

export class AssignDeliveryDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  driverId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;
}
