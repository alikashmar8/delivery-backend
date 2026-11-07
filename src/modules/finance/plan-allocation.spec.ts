import { describe, expect, it } from 'vitest';
import { allocateDeliveryFee, type PlanComponents } from './plan-allocation';

const components: PlanComponents = {
  deliveryAllocation: {
    platformFixedAmount: '0',
    platformPercentage: 25,
    driverFixedAmount: '0',
    driverPercentage: 0,
    driverGetsRemainder: true,
  },
  recurringCharge: { type: 'NONE', amountMinorUnits: '0', currency: 'USD' },
};

describe('driver fee allocation', () => {
  it('rounds half up and preserves an exact total', () => {
    expect(allocateDeliveryFee(components, '2')).toEqual({
      platformShareMinorUnits: '1',
      driverShareMinorUnits: '1',
    });
  });

  it('keeps zero shares without creating a negative amount', () => {
    expect(
      allocateDeliveryFee(
        {
          ...components,
          deliveryAllocation: {
            ...components.deliveryAllocation,
            platformPercentage: 100,
          },
        },
        '1',
      ),
    ).toEqual({ platformShareMinorUnits: '1', driverShareMinorUnits: '0' });
  });

  it('rejects non-reconciling fixed and independently rounded shares', () => {
    expect(() =>
      allocateDeliveryFee(
        {
          ...components,
          deliveryAllocation: {
            ...components.deliveryAllocation,
            platformFixedAmount: '2',
          },
        },
        '1',
      ),
    ).toThrow('reconcile');
    expect(() =>
      allocateDeliveryFee(
        {
          ...components,
          deliveryAllocation: {
            ...components.deliveryAllocation,
            platformPercentage: 50,
            driverPercentage: 50,
            driverGetsRemainder: false,
          },
        },
        '1',
      ),
    ).toThrow('reconcile');
  });
});
