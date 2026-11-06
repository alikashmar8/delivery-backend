import { ApiProperty } from '@nestjs/swagger';
import { PricingRule } from '../entities/pricing-rule.entity';

export class PricingRuleResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid', nullable: true })
  businessId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true })
  zoneId!: string | null;
  @ApiProperty({ minLength: 3, maxLength: 3, example: 'USD' })
  currency!: string;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  baseFee!: string;
  @ApiProperty({ type: String, pattern: '^(0|[1-9]\\d*)$', nullable: true })
  perKm!: string | null;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  zoneSurcharge!: string;
  @ApiProperty({ type: String, nullable: true })
  codFeePercent!: string | null;
  @ApiProperty({ minimum: 0 })
  priority!: number;
  @ApiProperty()
  active!: boolean;
  @ApiProperty({ type: String, format: 'date-time' })
  effectiveFrom!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  effectiveTo!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class FeeBreakdownResponseDto {
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  baseFee!: string;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  zoneSurcharge!: string;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  perKmFee!: string;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  codFee!: string;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  totalFee!: string;
  @ApiProperty({ minLength: 3, maxLength: 3, example: 'USD' })
  currency!: string;
  @ApiProperty({ format: 'uuid' })
  pricingRuleId!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  pricingRuleEffectiveFrom!: string;
}

export class PaginatedPricingRuleResponseDto {
  @ApiProperty({ type: () => [PricingRuleResponseDto] })
  items!: PricingRuleResponseDto[];
  @ApiProperty({ example: 20 })
  take!: number;
  @ApiProperty({ example: 0 })
  skip!: number;
}

export function toPricingRuleResponse(
  rule: PricingRule,
): PricingRuleResponseDto {
  return {
    id: rule.id,
    businessId: rule.businessId,
    zoneId: rule.zoneId,
    currency: rule.currency,
    baseFee: rule.baseFee,
    perKm: rule.perKm,
    zoneSurcharge: rule.zoneSurcharge,
    codFeePercent: rule.codFeePercent,
    priority: rule.priority,
    active: rule.active,
    effectiveFrom: rule.effectiveFrom,
    effectiveTo: rule.effectiveTo,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
  };
}
