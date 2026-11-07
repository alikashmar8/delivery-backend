import { BadRequestException } from '@nestjs/common';
import {
  decimalToScaled,
  multiplyAndRoundHalfUp,
  parseMoney,
} from '../../common/money/money';

export interface PlanComponents {
  deliveryAllocation: {
    platformFixedAmount: string;
    platformPercentage: number;
    driverFixedAmount: string;
    driverPercentage: number;
    driverGetsRemainder: boolean;
  };
  recurringCharge: {
    type: 'NONE' | 'DAILY' | 'MONTHLY';
    amountMinorUnits: string;
    currency: 'USD';
  };
}

export function allocateDeliveryFee(
  components: PlanComponents,
  eligibleFeeMinorUnits: string,
) {
  const fee = parseMoney(eligibleFeeMinorUnits, 'eligibleFee');
  const a = components.deliveryAllocation;
  if (a.platformPercentage > 100 || a.driverPercentage > 100) {
    throw new BadRequestException('Allocation percentages must not exceed 100');
  }
  const platform =
    parseMoney(a.platformFixedAmount, 'platformFixedAmount') +
    multiplyAndRoundHalfUp(
      fee,
      decimalToScaled(a.platformPercentage, 2, 'platformPercentage'),
      10_000n,
    );
  const driver = a.driverGetsRemainder
    ? fee - platform
    : parseMoney(a.driverFixedAmount, 'driverFixedAmount') +
      multiplyAndRoundHalfUp(
        fee,
        decimalToScaled(a.driverPercentage, 2, 'driverPercentage'),
        10_000n,
      );
  if (platform > fee || driver < 0n || platform + driver !== fee) {
    throw new BadRequestException(
      'Plan shares must reconcile to the eligible delivery fee',
    );
  }
  return {
    platformShareMinorUnits: platform.toString(),
    driverShareMinorUnits: driver.toString(),
  };
}
