import { describe, expect, it } from 'vitest';
import { financialSnapshotTerms } from './financial-snapshot';
import type { Delivery } from '../deliveries/entities/delivery.entity';
import type { PlanComponents } from './plan-allocation';

const components: PlanComponents = {
  deliveryAllocation: {
    platformFixedAmount: '100',
    platformPercentage: 0,
    driverFixedAmount: '0',
    driverPercentage: 0,
    driverGetsRemainder: true,
  },
  recurringCharge: { type: 'NONE', amountMinorUnits: '0', currency: 'USD' },
};
const delivery = {
  currency: 'USD',
  deliveryFee: '500',
  pricingRuleId: 'rule',
  paymentMethod: 'cod',
  feeBreakdown: {
    pricingRuleId: 'rule',
    pricingRuleEffectiveFrom: '2026-01-01T00:00:00Z',
    distanceKm: 0,
    baseFee: '300',
    zoneSurcharge: '100',
    perKmFee: '50',
    codFee: '50',
    totalFee: '500',
    currency: 'USD',
  },
} as Delivery;

describe('immutable commercial snapshot terms', () => {
  it('locks the original quote and exact approved 500/400/100 split', () => {
    const terms = financialSnapshotTerms(delivery, components);
    expect(terms).toMatchObject({
      currency: 'USD',
      customerDeliveryFee: '500',
      driverEarnings: '400',
      platformDeliveryRevenue: '100',
      eligibleFeeComponents: {
        baseFee: '300',
        totalEligibleFee: '500',
        paymentMethod: 'cod',
      },
    });
    delivery.feeBreakdown!.baseFee = '301';
    expect(terms.eligibleFeeComponents.baseFee).toBe('300');
    delivery.feeBreakdown!.baseFee = '300';
  });
  it('rejects unproven legacy quotes, wrong currency and unreconciled provenance', () => {
    expect(() =>
      financialSnapshotTerms({ ...delivery, feeBreakdown: null }, components),
    ).toThrow();
    expect(() =>
      financialSnapshotTerms({ ...delivery, currency: 'LBP' }, components),
    ).toThrow();
    expect(() =>
      financialSnapshotTerms({ ...delivery, deliveryFee: '501' }, components),
    ).toThrow();
  });
  it('preserves large integer minor units, zero shares and half-up rounding', () => {
    const quote = (fee: string) => ({
      ...delivery,
      deliveryFee: fee,
      feeBreakdown: {
        ...delivery.feeBreakdown!,
        baseFee: fee,
        zoneSurcharge: '0',
        perKmFee: '0',
        codFee: '0',
        totalFee: fee,
      },
    });
    expect(
      financialSnapshotTerms(quote('9007199254740993'), components)
        .driverEarnings,
    ).toBe('9007199254740893');
    const half = {
      ...components,
      deliveryAllocation: {
        ...components.deliveryAllocation,
        platformFixedAmount: '0',
        platformPercentage: 50,
      },
    };
    expect(financialSnapshotTerms(quote('1'), half)).toMatchObject({
      driverEarnings: '0',
      platformDeliveryRevenue: '1',
    });
    expect(financialSnapshotTerms(quote('0'), half)).toMatchObject({
      driverEarnings: '0',
      platformDeliveryRevenue: '0',
    });
  });
});
