import { describe, expect, it } from 'vitest';
import { setTimeout } from 'node:timers/promises';
import {
  MEMORY_STATE_MAX_ENTRIES,
  MemoryOtpState,
  constantTimeEqualHex,
  sha256Hex,
} from './otp-state';

describe('MemoryOtpState challenges', () => {
  it('consumes a fresh challenge exactly once', async () => {
    const state = new MemoryOtpState();
    await state.requestChallenge('+96170000001', sha256Hex('123456'), 60_000);

    await expect(
      state.consumeChallenge('+96170000001', sha256Hex('123456'), 5),
    ).resolves.toBe('ok');
    await expect(
      state.consumeChallenge('+96170000001', sha256Hex('123456'), 5),
    ).resolves.toBe('not-found');
  });

  it('rejects wrong codes and reports missing after the attempt cap', async () => {
    const state = new MemoryOtpState();
    await state.requestChallenge('+96170000002', sha256Hex('123456'), 60_000);

    for (let i = 0; i < 4; i += 1) {
      await expect(
        state.consumeChallenge('+96170000002', sha256Hex('000000'), 5),
      ).resolves.toBe('invalid');
    }
    // The attempt reaching the cap still reports invalid; the challenge is
    // gone afterwards.
    await expect(
      state.consumeChallenge('+96170000002', sha256Hex('000000'), 5),
    ).resolves.toBe('invalid');
    await expect(
      state.consumeChallenge('+96170000002', sha256Hex('123456'), 5),
    ).resolves.toBe('not-found');
  });

  it('reports missing for unknown phones and expired challenges', async () => {
    const state = new MemoryOtpState();
    await expect(
      state.consumeChallenge('+96170000003', sha256Hex('123456'), 5),
    ).resolves.toBe('not-found');

    await state.requestChallenge('+96170000004', sha256Hex('123456'), 30);
    await setTimeout(60);
    await expect(
      state.consumeChallenge('+96170000004', sha256Hex('123456'), 5),
    ).resolves.toBe('not-found');
  });

  it('lets a re-requested code replace the previous challenge', async () => {
    const state = new MemoryOtpState();
    await state.requestChallenge('+96170000005', sha256Hex('111111'), 60_000);
    await state.requestChallenge('+96170000005', sha256Hex('222222'), 60_000);

    await expect(
      state.consumeChallenge('+96170000005', sha256Hex('111111'), 5),
    ).resolves.toBe('invalid');
    await expect(
      state.consumeChallenge('+96170000005', sha256Hex('222222'), 5),
    ).resolves.toBe('ok');
  });

  it('grants exactly one winner under concurrent consumes', async () => {
    const state = new MemoryOtpState();
    await state.requestChallenge('+96170000006', sha256Hex('123456'), 60_000);

    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        state.consumeChallenge('+96170000006', sha256Hex('123456'), 5),
      ),
    );
    expect(results.filter((r) => r === 'ok')).toHaveLength(1);
    expect(results.filter((r) => r === 'not-found')).toHaveLength(19);
  });

  it('bounds retention when flooded with challenges', async () => {
    const state = new MemoryOtpState();
    for (let i = 0; i < MEMORY_STATE_MAX_ENTRIES + 50; i += 1) {
      await state.requestChallenge(
        `+9617${String(i).padStart(7, '0')}`,
        sha256Hex('123456'),
        60_000,
      );
    }
    expect(state.sizes().challenges).toBeLessThanOrEqual(
      MEMORY_STATE_MAX_ENTRIES,
    );
  });
});

describe('MemoryOtpState proofs', () => {
  it('consumes a proof once and only for the bound phone', async () => {
    const state = new MemoryOtpState();
    await state.createProof('token-hash-1', '+96170000007', 60_000);

    await expect(
      state.consumeProof('token-hash-1', '+96170000008'),
    ).resolves.toBe(false);
    // A mismatched phone burns the single-use proof.
    await expect(
      state.consumeProof('token-hash-1', '+96170000007'),
    ).resolves.toBe(false);

    await state.createProof('token-hash-2', '+96170000007', 60_000);
    await expect(
      state.consumeProof('token-hash-2', '+96170000007'),
    ).resolves.toBe(true);
    await expect(
      state.consumeProof('token-hash-2', '+96170000007'),
    ).resolves.toBe(false);
  });

  it('expires proofs', async () => {
    const state = new MemoryOtpState();
    await state.createProof('token-hash-3', '+96170000009', 30);
    await setTimeout(60);
    await expect(
      state.consumeProof('token-hash-3', '+96170000009'),
    ).resolves.toBe(false);
  });
});

describe('MemoryOtpState rate limits', () => {
  it('allows the limit then denies until the window resets', async () => {
    const state = new MemoryOtpState();
    for (let i = 0; i < 3; i += 1) {
      await expect(state.checkLimit('scope-a', 3, 60_000)).resolves.toBe(true);
    }
    await expect(state.checkLimit('scope-a', 3, 60_000)).resolves.toBe(false);
    await expect(state.checkLimit('scope-b', 3, 60_000)).resolves.toBe(true);
  });

  it('resets the window after expiry', async () => {
    const state = new MemoryOtpState();
    await expect(state.checkLimit('scope-c', 1, 30)).resolves.toBe(true);
    await expect(state.checkLimit('scope-c', 1, 30)).resolves.toBe(false);
    await setTimeout(60);
    await expect(state.checkLimit('scope-c', 1, 30)).resolves.toBe(true);
  });
});

describe('hash helpers', () => {
  it('compares hex digests in constant time and hashes deterministically', () => {
    const digest = sha256Hex('123456');
    expect(constantTimeEqualHex(digest, sha256Hex('123456'))).toBe(true);
    expect(constantTimeEqualHex(digest, sha256Hex('654321'))).toBe(false);
    expect(constantTimeEqualHex(digest, '00')).toBe(false);
  });
});
