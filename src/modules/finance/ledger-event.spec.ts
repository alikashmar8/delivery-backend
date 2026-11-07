import { describe, expect, it } from 'vitest';
import { normalizeLedgerEvent } from './ledger-event';

const event = {
  kind: 'priced' as const,
  sourceId: 'b7bff8f2-9e6b-4ca3-8407-70c0785bf890',
  createdById: null,
  occurredAt: '2026-11-07T08:00:00.000Z',
  entries: [],
};

describe('ledger event contract', () => {
  it('retains a stable source and normalizes fact time, including an all-zero event', () => {
    expect(
      normalizeLedgerEvent({
        ...event,
        occurredAt: '2026-11-07T10:00:00+02:00',
      }),
    ).toEqual(event);
  });

  it('rejects retry-time identity, invalid fact times and unbounded batches', () => {
    expect(() =>
      normalizeLedgerEvent({ ...event, sourceId: 'timestamp-key' }),
    ).toThrow();
    expect(() =>
      normalizeLedgerEvent({ ...event, occurredAt: 'invalid' }),
    ).toThrow();
    expect(() =>
      normalizeLedgerEvent({ ...event, occurredAt: '2026-11-07T08:00:00' }),
    ).toThrow();
    expect(() =>
      normalizeLedgerEvent({ ...event, entries: Array(21).fill({}) }),
    ).toThrow();
  });

  it('accepts exact large minor units and rejects zero, floats, overflow and non-USD', () => {
    const entry = {
      entryType: 'PLATFORM_DELIVERY_REVENUE' as const,
      beneficiaryType: 'platform' as const,
      amount: '9007199254740993',
      currency: 'USD' as const,
      deliveryId: event.sourceId,
    };
    expect(
      normalizeLedgerEvent({ ...event, entries: [entry] }).entries[0].amount,
    ).toBe('9007199254740993');
    for (const amount of ['0', '-1', '1.2', '9223372036854775808']) {
      expect(() =>
        normalizeLedgerEvent({ ...event, entries: [{ ...entry, amount }] }),
      ).toThrow();
    }
    expect(() =>
      normalizeLedgerEvent({
        ...event,
        entries: [{ ...entry, currency: 'LBP' as 'USD' }],
      }),
    ).toThrow();
  });
});
