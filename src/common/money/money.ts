import { BadRequestException } from '@nestjs/common';

const MONEY_PATTERN = /^(0|[1-9]\d*)$/;
const MAX_BIGINT = 9_223_372_036_854_775_807n;

export function parseMoney(value: string, field: string): bigint {
  if (!MONEY_PATTERN.test(value)) {
    throw new BadRequestException(`${field} must be integer minor units`);
  }

  const parsed = BigInt(value);
  if (parsed > MAX_BIGINT) {
    throw new BadRequestException(`${field} exceeds the supported range`);
  }
  return parsed;
}

export function decimalToScaled(
  value: string | number,
  scale: number,
  field: string,
): bigint {
  const normalized = String(value);
  const match = normalized.match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) throw new BadRequestException(`${field} must be non-negative`);

  const fraction = match[2] ?? '';
  if (fraction.length > scale) {
    throw new BadRequestException(`${field} has too many decimal places`);
  }

  return (
    BigInt(match[1]) * 10n ** BigInt(scale) +
    BigInt(fraction.padEnd(scale, '0') || '0')
  );
}

export function multiplyAndRoundHalfUp(
  amount: bigint,
  multiplier: bigint,
  scale: bigint,
): bigint {
  return (amount * multiplier + scale / 2n) / scale;
}
