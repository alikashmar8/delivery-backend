import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

const MONEY_PATTERN = /^(0|[1-9]\d*)$/;

export class CreatePricingRuleDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  businessId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  zoneId?: string;
  @ApiPropertyOptional({ enum: ['USD'] })
  @IsOptional()
  @IsIn(['USD'])
  currency?: string;

  @ApiProperty({
    example: '500',
    pattern: '^(0|[1-9]\\d*)$',
    description: 'Integer minor units, never a decimal amount',
  })
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'baseFee must be integer minor units' })
  baseFee!: string;

  @ApiPropertyOptional({
    example: '25',
    pattern: '^(0|[1-9]\\d*)$',
    description: 'Integer minor units, never a decimal amount',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'perKm must be integer minor units' })
  perKm?: string;

  @ApiPropertyOptional({
    example: '100',
    pattern: '^(0|[1-9]\\d*)$',
    description: 'Integer minor units, never a decimal amount',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'zoneSurcharge must be integer minor units',
  })
  zoneSurcharge?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 100, multipleOf: 0.01 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  codFeePercent?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class UpdatePricingRuleDto {
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
  @Matches(MONEY_PATTERN, { message: 'baseFee must be integer minor units' })
  baseFee?: string;
  @ApiPropertyOptional({
    pattern: '^(0|[1-9]\\d*)$',
    description: 'Integer minor units, never a decimal amount',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'perKm must be integer minor units' })
  perKm?: string;
  @ApiPropertyOptional({
    pattern: '^(0|[1-9]\\d*)$',
    description: 'Integer minor units, never a decimal amount',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'zoneSurcharge must be integer minor units',
  })
  zoneSurcharge?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 100, multipleOf: 0.01 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  codFeePercent?: number;
  @ApiPropertyOptional({ minimum: 0 })
  @IsOptional()
  @IsInt()
  priority?: number;
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;
}

export class ComputeFeeDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  businessId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  zoneId?: string;
  @ApiPropertyOptional({
    pattern: '^(0|[1-9]\\d*)$',
    description: 'Integer minor units, never a decimal amount',
  })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'codAmount must be integer minor units' })
  codAmount?: string;
  @ApiPropertyOptional({ minimum: 0, maximum: 100000, multipleOf: 0.000001 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0)
  @Max(100_000)
  distanceKm?: number;
  @ApiPropertyOptional({ enum: ['USD'] })
  @IsOptional()
  @IsIn(['USD'])
  currency?: string;
}

export class ListPricingRulesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  businessId?: string;
}
