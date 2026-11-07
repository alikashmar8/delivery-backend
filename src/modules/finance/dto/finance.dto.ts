import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsDefined,
  IsEnum,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { PlanType } from '../entities/driver-compensation-plan.entity';

const MONEY = /^(0|[1-9]\d*)$/;

export class DeliveryAllocationDto {
  @ApiPropertyOptional({
    example: '0',
    description: 'USD integer minor units; default 0',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(MONEY)
  platformFixedAmount?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 0 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  platformPercentage?: number;
  @ApiPropertyOptional({
    example: '0',
    description: 'USD integer minor units; default 0',
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(MONEY)
  driverFixedAmount?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 0 })
  @ValidateIf((_object, value) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  driverPercentage?: number;
  @ApiPropertyOptional({ default: true })
  @ValidateIf((_object, value) => value !== undefined)
  @IsBoolean()
  driverGetsRemainder?: boolean;
}

export class RecurringChargeDto {
  @ApiProperty({ enum: ['NONE', 'DAILY', 'MONTHLY'] })
  @IsIn(['NONE', 'DAILY', 'MONTHLY'])
  type!: 'NONE' | 'DAILY' | 'MONTHLY';
  @ApiPropertyOptional({
    example: '0',
    description: 'USD integer minor units; optional for NONE',
  })
  @ValidateIf(
    (object: RecurringChargeDto, value) =>
      object.type !== 'NONE' || value !== undefined,
  )
  @IsString()
  @Matches(MONEY)
  amountMinorUnits?: string;
  @ApiProperty({ enum: ['USD'] }) @IsIn(['USD']) currency!: 'USD';
}

export class PlanComponentsDto {
  @ApiProperty({ type: () => DeliveryAllocationDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DeliveryAllocationDto)
  deliveryAllocation!: DeliveryAllocationDto;
  @ApiProperty({ type: () => RecurringChargeDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RecurringChargeDto)
  recurringCharge!: RecurringChargeDto;
}

export class CreatePlanDto {
  @ApiProperty({ maxLength: 255 })
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name!: string;
  @ApiProperty({ enum: PlanType }) @IsEnum(PlanType) type!: PlanType;
  @ApiProperty({ type: () => PlanComponentsDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => PlanComponentsDto)
  components!: PlanComponentsDto;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class CreateAssignmentDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() planId!: string;
  @ApiProperty({ format: 'date-time' }) @IsDateString() effectiveFrom!: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class RetirePlanDto {
  @ApiProperty({ format: 'date-time' })
  @IsDateString()
  effectiveTo!: string;
}

export class PlanResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: PlanType }) type!: PlanType;
  @ApiProperty() active!: boolean;
  @ApiProperty({ type: () => PlanComponentsDto })
  components!: PlanComponentsDto;
  @ApiProperty({ type: String, format: 'date-time' }) effectiveFrom!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  effectiveTo!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class AssignmentResponseDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) driverId!: string;
  @ApiProperty({ format: 'uuid' }) planId!: string;
  @ApiProperty({ type: String, format: 'date-time' }) effectiveFrom!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  effectiveTo!: Date | null;
  @ApiProperty({ format: 'uuid' }) createdById!: string;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}

export class PaginatedPlanResponseDto {
  @ApiProperty({ type: () => [PlanResponseDto] }) items!: PlanResponseDto[];
  @ApiProperty() take!: number;
  @ApiProperty() skip!: number;
}

export class PaginatedAssignmentResponseDto {
  @ApiProperty({ type: () => [AssignmentResponseDto] })
  items!: AssignmentResponseDto[];
  @ApiProperty() take!: number;
  @ApiProperty() skip!: number;
}
