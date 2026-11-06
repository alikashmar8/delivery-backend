import type Redis from 'ioredis';
import { setTimeout } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/modules/auth/otp/otp-state';
import { RedisOtpState } from '../src/modules/auth/otp/redis-otp-state';
import { createEphemeralRedis } from './helpers/redis-container';

describe('RedisOtpState against real Redis', () => {
  let redis: Awaited<ReturnType<typeof createEphemeralRedis>>;
  let client: Redis;
  let state: RedisOtpState;

  beforeAll(async () => {
    redis = await createEphemeralRedis();
    client = redis.client;
    state = new RedisOtpState(client);
  });

  afterAll(async () => {
    await redis.close();
  });

  it('consumes a challenge exactly once', async () => {
    await state.requestChallenge('+96171000001', sha256Hex('123456'), 60_000);
    await expect(
      state.consumeChallenge('+96171000001', sha256Hex('123456'), 5),
    ).resolves.toBe('ok');
    await expect(
      state.consumeChallenge('+96171000001', sha256Hex('123456'), 5),
    ).resolves.toBe('not-found');
  });

  it('counts wrong attempts and expires the challenge at the cap', async () => {
    await state.requestChallenge('+96171000002', sha256Hex('123456'), 60_000);
    for (let i = 0; i < 5; i += 1) {
      await expect(
        state.consumeChallenge('+96171000002', sha256Hex('000000'), 5),
      ).resolves.toBe('invalid');
    }
    await expect(
      state.consumeChallenge('+96171000002', sha256Hex('123456'), 5),
    ).resolves.toBe('not-found');
  });

  it('expires challenges and proofs by TTL', async () => {
    await state.requestChallenge('+96171000003', sha256Hex('123456'), 50);
    await setTimeout(150);
    await expect(
      state.consumeChallenge('+96171000003', sha256Hex('123456'), 5),
    ).resolves.toBe('not-found');

    await state.createProof('proof-expiry-1', '+96171000003', 50);
    await setTimeout(150);
    await expect(
      state.consumeProof('proof-expiry-1', '+96171000003'),
    ).resolves.toBe(false);
  });

  it('grants exactly one winner under concurrent consumes', async () => {
    await state.requestChallenge('+96171000004', sha256Hex('123456'), 60_000);
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        state.consumeChallenge('+96171000004', sha256Hex('123456'), 5),
      ),
    );
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === 'not-found')).toHaveLength(19);
  });

  it('consumes proofs once and burns them on phone mismatch', async () => {
    await state.createProof('proof-once-1', '+96171000005', 60_000);
    await expect(
      state.consumeProof('proof-once-1', '+96171000006'),
    ).resolves.toBe(false);
    await expect(
      state.consumeProof('proof-once-1', '+96171000005'),
    ).resolves.toBe(false);

    await state.createProof('proof-once-2', '+96171000005', 60_000);
    await expect(
      state.consumeProof('proof-once-2', '+96171000005'),
    ).resolves.toBe(true);
    await expect(
      state.consumeProof('proof-once-2', '+96171000005'),
    ).resolves.toBe(false);
  });

  it('enforces scoped rate limits and resets after the window', async () => {
    for (let i = 0; i < 3; i += 1) {
      await expect(state.checkLimit('s01-scope-a', 3, 60_000)).resolves.toBe(
        true,
      );
    }
    await expect(state.checkLimit('s01-scope-a', 3, 60_000)).resolves.toBe(
      false,
    );
    await expect(state.checkLimit('s01-scope-b', 3, 60_000)).resolves.toBe(
      true,
    );

    await expect(state.checkLimit('s01-window', 1, 60)).resolves.toBe(true);
    await expect(state.checkLimit('s01-window', 1, 60)).resolves.toBe(false);
    await setTimeout(150);
    await expect(state.checkLimit('s01-window', 1, 60)).resolves.toBe(true);
  });

  it('admits exactly the limit under concurrent increments', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => state.checkLimit('s01-race', 5, 60_000)),
    );
    expect(results.filter(Boolean)).toHaveLength(5);
  });

  it('shares state across store instances (restart semantics)', async () => {
    await state.requestChallenge('+96171000007', sha256Hex('123456'), 60_000);
    const restarted = new RedisOtpState(client);
    await expect(
      restarted.consumeChallenge('+96171000007', sha256Hex('123456'), 5),
    ).resolves.toBe('ok');
  });

  it('never stores raw phone numbers in Redis keys', async () => {
    await state.requestChallenge('+96171000008', sha256Hex('123456'), 60_000);
    await state.createProof('proof-key-check', '+96171000008', 60_000);
    await state.checkLimit('+96171000008', 5, 60_000);
    const keys: string[] = await client.keys('otp:*');
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).not.toContain('+96171000008');
    }
  });
});
