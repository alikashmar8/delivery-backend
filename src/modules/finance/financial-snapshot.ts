import { BadRequestException } from '@nestjs/common';
import { parseMoney } from '../../common/money/money';
import type { Delivery } from '../deliveries/entities/delivery.entity';
import { allocateDeliveryFee, type PlanComponents } from './plan-allocation';

export function financialSnapshotTerms(
  delivery: Delivery,
  components: PlanComponents,
) {
  const quote = delivery.feeBreakdown;
  if (
    !quote ||
    !delivery.pricingRuleId ||
    delivery.currency !== 'USD' ||
    quote.currency !== 'USD' ||
    quote.pricingRuleId !== delivery.pricingRuleId ||
    quote.totalFee !== delivery.deliveryFee ||
    parseMoney(quote.baseFee, 'baseFee') +
      parseMoney(quote.zoneSurcharge, 'zoneSurcharge') +
      parseMoney(quote.perKmFee, 'perKmFee') +
      parseMoney(quote.codFee, 'codFee') !==
      parseMoney(delivery.deliveryFee, 'deliveryFee')
  ) {
    throw new BadRequestException(
      'A reproducible USD quote is required before assignment',
    );
  }
  const shares = allocateDeliveryFee(components, delivery.deliveryFee);
  return {
    currency: 'USD',
    customerDeliveryFee: delivery.deliveryFee,
    driverEarnings: shares.driverShareMinorUnits,
    platformDeliveryRevenue: shares.platformShareMinorUnits,
    eligibleFeeComponents: {
      ...quote,
      totalEligibleFee: delivery.deliveryFee,
      paymentMethod: delivery.paymentMethod,
    },
  };
}
