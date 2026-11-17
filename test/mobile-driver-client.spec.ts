import { beforeAll, describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
const modulePath = resolve(
  process.cwd(),
  '../delivery-mobile/src/driver/pending-operation.ts',
);
let cashAmount: (input: string, outstanding: string) => string;
let usd: (amount: string) => string;
let nextDriverAction: Partial<
  Record<DeliveryStatus, { status: DeliveryStatus; label: string }>
>;
let persistPending: (
  storage: PendingStorage,
  operation: unknown,
) => Promise<void>;
let readPending: (storage: PendingStorage, owner: string) => Promise<unknown>;
let sendPending: (
  storage: PendingStorage,
  operation: unknown,
  send: (operation: unknown) => Promise<void>,
) => Promise<void>;
beforeAll(async () => {
  ({
    cashAmount,
    nextDriverAction,
    persistPending,
    readPending,
    sendPending,
    usd,
  } = await import(modulePath));
});
interface PendingStorage {
  read(owner: string): Promise<string | null>;
  write(owner: string, value: string): Promise<void>;
  remove(owner: string): Promise<void>;
}
import { canTransition } from '../src/modules/deliveries/state-machine/delivery-state-machine';
import { DeliveryStatus } from '../src/modules/deliveries/entities/delivery.entity';

function storage() {
  const values = new Map<string, string>();
  const adapter: PendingStorage = {
    read: async (owner) => values.get(owner) ?? null,
    write: async (owner, value) => {
      values.set(owner, value);
    },
    remove: async (owner) => {
      values.delete(owner);
    },
  };
  return { values, adapter };
}
const payment = {
  kind: 'payment',
  ownerId: 'owner',
  deliveryId: 'delivery',
  body: { receiptId: 'receipt', expectedVersion: 7, amount: '6000' },
};
describe('driver request recovery (storage/transport boundaries mocked, not device acceptance)', () => {
  it('persists before transport, retains unknown outcomes and replays the exact receipt/version after restart', async () => {
    const { adapter } = storage();
    const sent: unknown[] = [];
    await expect(
      sendPending(adapter, payment, async (operation: unknown) => {
        expect(await readPending(adapter, 'owner')).toEqual(payment);
        sent.push(operation);
        throw new Error('response lost after server commit');
      }),
    ).rejects.toThrow('response lost');
    const restored = await readPending(adapter, 'owner');
    expect(restored).toEqual(payment);
    if (!restored) throw new Error('receipt missing');
    await sendPending(adapter, restored, async (operation: unknown) => {
      sent.push(operation);
    });
    expect(sent).toEqual([payment, payment]);
    expect(await readPending(adapter, 'owner')).toBeNull();
  });
  it('does not send when local persistence fails', async () => {
    const { adapter } = storage();
    let sent = false;
    adapter.write = async () => {
      throw new Error('Keystore unavailable');
    };
    await expect(
      sendPending(adapter, payment, async () => {
        sent = true;
      }),
    ).rejects.toThrow('Keystore');
    expect(sent).toBe(false);
  });
  it('retains replay identity when cleanup fails after server confirmation', async () => {
    const { adapter } = storage();
    adapter.remove = async () => {
      throw new Error('cleanup interrupted');
    };
    await expect(sendPending(adapter, payment, async () => {})).rejects.toThrow(
      'cleanup',
    );
    expect(await readPending(adapter, 'owner')).toEqual(payment);
  });
  it('isolates pending work by authenticated owner and rejects a cross-owner journal', async () => {
    const { adapter, values } = storage();
    await persistPending(adapter, payment);
    expect(await readPending(adapter, 'other')).toBeNull();
    values.set('other', JSON.stringify(payment));
    await expect(readPending(adapter, 'other')).rejects.toThrow('safely');
  });
  it('blocks truncated or malformed pending work without clearing its recovery evidence', async () => {
    const { adapter, values } = storage();
    const invalid = [
      '{truncated',
      { ...payment, body: undefined },
      { ...payment, body: { ...payment.body, expectedVersion: 0 } },
      { ...payment, body: { ...payment.body, amount: '1.50' } },
      {
        kind: 'action',
        ownerId: 'owner',
        deliveryId: 'delivery',
        key: 'key',
        body: { expectedVersion: 1, toStatus: 'COMPLETED' },
      },
      {
        kind: 'photo',
        ownerId: 'owner',
        deliveryId: 'delivery',
        uploadId: 'upload',
        expectedVersion: 1,
        uri: null,
        uploaded: true,
      },
    ];
    for (const value of invalid) {
      const raw = typeof value === 'string' ? value : JSON.stringify(value);
      values.set('owner', raw);
      await expect(readPending(adapter, 'owner')).rejects.toThrow('safely');
      expect(values.get('owner')).toBe(raw);
    }
  });
  it('preserves pending camera/file/upload phases across reload without sending requests', async () => {
    const { adapter } = storage();
    const photo = {
      kind: 'photo',
      ownerId: 'owner',
      deliveryId: 'delivery',
      expectedVersion: 8,
      uploadId: 'upload',
      uri: null,
      uploaded: false,
    };
    await persistPending(adapter, photo);
    expect(await readPending(adapter, 'owner')).toEqual(photo);
    const uploaded = {
      ...photo,
      uri: 'file:///private/proof.jpg',
      uploaded: true,
    };
    await persistPending(adapter, uploaded);
    expect(await readPending(adapter, 'owner')).toEqual(uploaded);
  });
  it('validates cash without float conversion, including large values and overpayment', () => {
    expect(cashAmount('9007199254740993', '9007199254740993')).toBe(
      '9007199254740993',
    );
    expect(usd('9007199254740993')).toBe('$90071992547409.93');
    for (const value of [
      '0',
      '-1',
      '1.5',
      '01',
      '1e2',
      ' 1',
      '101',
      '99999999999999999999',
    ]) {
      expect(() => cashAmount(value, '100')).toThrow('positive USD cents');
    }
  });
  it('offers only existing driver FSM edges and never a client COMPLETED transition', () => {
    for (const [from, action] of Object.entries(nextDriverAction) as [
      string,
      { status: string },
    ][]) {
      expect(
        canTransition(
          from as DeliveryStatus,
          action.status as DeliveryStatus,
          'driver',
        ),
      ).toBe(true);
      expect(action.status).not.toBe('COMPLETED');
    }
    expect(nextDriverAction.DELIVERED).toBeUndefined();
    expect(nextDriverAction.FAILED).toBeUndefined();
  });
});
