import type Redis from 'ioredis';
import { sha256Hex } from './otp-state';
import type { OtpState } from './otp-state';

/**
 * Consume an OTP challenge atomically. KEYS[1] is the challenge hash key
 * holding fields `h` (code hash) and `a` (attempt count). ARGV[1] is the
 * candidate code hash, ARGV[2] the max attempts.
 * Returns 0 (consumed), 1 (missing/expired) or 3 (wrong code). A wrong code
 * that reaches the attempt cap deletes the challenge, mirroring the
 * single-instance semantics: the next consume reports missing.
 */
const CONSUME_CHALLENGE_LUA = `
local hash = redis.call('HGET', KEYS[1], 'h')
if not hash then return 1 end
local attempts = tonumber(redis.call('HGET', KEYS[1], 'a') or '0')
if attempts >= tonumber(ARGV[2]) then
  redis.call('DEL', KEYS[1])
  return 1
end
local candidate = ARGV[1]
local match = true
if #candidate ~= #hash then
  match = false
else
  local diff = 0
  for i = 1, #candidate do
    diff = diff + math.abs(string.byte(candidate, i) - string.byte(hash, i))
  end
  if diff ~= 0 then match = false end
end
if match then
  redis.call('DEL', KEYS[1])
  return 0
end
local count = redis.call('HINCRBY', KEYS[1], 'a', 1)
if count >= tonumber(ARGV[2]) then redis.call('DEL', KEYS[1]) end
return 3
`;

/**
 * Consume a registration proof atomically. The proof is single-use: it is
 * deleted before the phone comparison, so a mismatched phone burns the proof
 * instead of leaving it replayable. Returns 1 on success, 0 otherwise.
 */
const CONSUME_PROOF_LUA = `
local phone = redis.call('GET', KEYS[1])
if not phone then return 0 end
redis.call('DEL', KEYS[1])
if phone == ARGV[1] then return 1 end
return 0
`;

/**
 * Fixed-window rate limit. Returns 1 when the call is within budget, 0 when
 * the scoped counter already reached the limit. ARGV[1] is the window in ms,
 * ARGV[2] the limit.
 */
const CHECK_LIMIT_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
if count > tonumber(ARGV[2]) then return 0 end
return 1
`;

function challengeKey(phone: string): string {
  return `otp:challenge:${sha256Hex(phone)}`;
}

function proofKey(tokenHash: string): string {
  return `otp:proof:${tokenHash}`;
}

function limitKey(scope: string): string {
  return `otp:limit:${sha256Hex(scope)}`;
}

/**
 * Shared OtpState for deployed (possibly multi-instance) environments.
 * Challenges, proofs and rate-limit counters live in Redis with TTL expiry,
 * so concurrent consumes and restarts behave identically on every replica.
 * Redis keys never contain raw phone numbers — scopes are SHA-256 hashed.
 */
export class RedisOtpState implements OtpState {
  constructor(private readonly redis: Redis) {}

  async requestChallenge(
    phone: string,
    codeHash: string,
    ttlMs: number,
  ): Promise<void> {
    const key = challengeKey(phone);
    await this.redis.hset(key, { h: codeHash, a: '0' });
    await this.redis.pexpire(key, ttlMs);
  }

  async consumeChallenge(
    phone: string,
    candidateHash: string,
    maxAttempts: number,
  ): Promise<'ok' | 'invalid' | 'not-found'> {
    const result = (await this.redis.eval(
      CONSUME_CHALLENGE_LUA,
      1,
      challengeKey(phone),
      candidateHash,
      String(maxAttempts),
    )) as number;
    if (result === 0) return 'ok';
    if (result === 3) return 'invalid';
    return 'not-found';
  }

  async createProof(
    tokenHash: string,
    phone: string,
    ttlMs: number,
  ): Promise<void> {
    await this.redis.set(proofKey(tokenHash), phone, 'PX', ttlMs);
  }

  async consumeProof(tokenHash: string, phone: string): Promise<boolean> {
    const result = (await this.redis.eval(
      CONSUME_PROOF_LUA,
      1,
      proofKey(tokenHash),
      phone,
    )) as number;
    return result === 1;
  }

  async checkLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    const result = (await this.redis.eval(
      CHECK_LIMIT_LUA,
      1,
      limitKey(key),
      String(windowMs),
      String(limit),
    )) as number;
    return result === 1;
  }
}
