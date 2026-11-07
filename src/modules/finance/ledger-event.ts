import { BadRequestException } from '@nestjs/common';
import { isISO8601, isUUID } from 'class-validator';
import { parseMoney } from '../../common/money/money';

export const LEDGER_ENTRY_TYPES = [
  'COD_COLLECTED',
  'COD_PAYABLE',
  'DELIVERY_FEE_CHARGED',
  'DRIVER_EARNING',
  'PLATFORM_DELIVERY_REVENUE',
  'DRIVER_DAILY_CHARGE',
  'DRIVER_MONTHLY_CHARGE',
  'SETTLEMENT',
  'REFUND',
  'ADJUSTMENT',
  'REVERSAL',
] as const;
export type LedgerEntryType = (typeof LEDGER_ENTRY_TYPES)[number];
export const LEDGER_EVENT_KINDS = [
  'priced',
  'collection',
  'charge',
  'reversal',
  'reassignment',
  'adjustment',
  'settlement',
  'refund',
] as const;
export type LedgerEventKind = (typeof LEDGER_EVENT_KINDS)[number];
export type BeneficiaryType = 'user' | 'business' | 'platform';

export interface LedgerEntryInput {
  entryType: LedgerEntryType;
  amount: string;
  currency: 'USD';
  beneficiaryType: BeneficiaryType;
  beneficiaryUserId?: string | null;
  beneficiaryBusinessId?: string | null;
  deliveryId?: string | null;
  driverId?: string | null;
  periodStart?: string | null;
  reversesEntryId?: string | null;
  replacesEntryId?: string | null;
  adjustsEntryId?: string | null;
  description?: string | null;
}

export interface LedgerEventInput {
  kind: LedgerEventKind;
  // Stable domain fact ID, never a new UUID or current timestamp on each retry.
  sourceId: string;
  createdById: string | null;
  occurredAt: string;
  entries: LedgerEntryInput[];
}

function uuid(value: string): string {
  if (typeof value !== 'string' || !isUUID(value))
    throw new BadRequestException('Ledger references must be UUIDs');
  return value.toLowerCase();
}

export function normalizeLedgerEvent(input: LedgerEventInput) {
  if (
    !LEDGER_EVENT_KINDS.includes(input.kind) ||
    typeof input.occurredAt !== 'string' ||
    !/T.*(?:Z|[+-]\d{2}:\d{2})$/.test(input.occurredAt) ||
    !isISO8601(input.occurredAt, { strict: true }) ||
    !Array.isArray(input.entries) ||
    input.entries.length > 20
  ) {
    throw new BadRequestException('Invalid ledger event');
  }
  return {
    kind: input.kind,
    sourceId: uuid(input.sourceId),
    createdById: input.createdById === null ? null : uuid(input.createdById),
    occurredAt: new Date(input.occurredAt).toISOString(),
    entries: input.entries.map((entry) => {
      if (
        !LEDGER_ENTRY_TYPES.includes(entry.entryType) ||
        entry.currency !== 'USD' ||
        typeof entry.amount !== 'string' ||
        parseMoney(entry.amount, 'amount') === 0n ||
        !['user', 'business', 'platform'].includes(entry.beneficiaryType)
      ) {
        throw new BadRequestException('Invalid positive USD ledger entry');
      }
      if (
        entry.periodStart != null &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(entry.periodStart) ||
          !isISO8601(entry.periodStart, { strict: true }))
      )
        throw new BadRequestException('Invalid charge period');
      if (
        entry.description != null &&
        (typeof entry.description !== 'string' ||
          entry.description.length > 2000)
      )
        throw new BadRequestException('Invalid ledger description');
      return {
        entryType: entry.entryType,
        amount: entry.amount,
        currency: entry.currency,
        beneficiaryType: entry.beneficiaryType,
        beneficiaryUserId:
          entry.beneficiaryUserId == null
            ? null
            : uuid(entry.beneficiaryUserId),
        beneficiaryBusinessId:
          entry.beneficiaryBusinessId == null
            ? null
            : uuid(entry.beneficiaryBusinessId),
        deliveryId: entry.deliveryId == null ? null : uuid(entry.deliveryId),
        driverId: entry.driverId == null ? null : uuid(entry.driverId),
        periodStart: entry.periodStart ?? null,
        reversesEntryId:
          entry.reversesEntryId == null ? null : uuid(entry.reversesEntryId),
        replacesEntryId:
          entry.replacesEntryId == null ? null : uuid(entry.replacesEntryId),
        adjustsEntryId:
          entry.adjustsEntryId == null ? null : uuid(entry.adjustsEntryId),
        description: entry.description ?? null,
      };
    }),
  };
}
