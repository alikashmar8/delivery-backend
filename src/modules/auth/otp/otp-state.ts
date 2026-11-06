import { createHash, timingSafeEqual } from 'node:crypto';

/** DI token for the shared OTP/proof/rate-limit store. */
export const OTP_STATE = 'OTP_STATE';

/**
 * Shared OTP challenge / registration-proof / rate-limit storage.
 *
 * Implementations must give atomic single-use consumption (concurrent consumes
 * of the same challenge or proof yield exactly one success) and bounded
 * retention (TTL expiry plus entry caps). Phone numbers are opaque strings
 * here; Redis keys derived from them are hashed inside the Redis
 * implementation. Nothing stored here is ever written to application logs.
 */
export interface OtpState {
  requestChallenge(
    phone: string,
    codeHash: string,
    ttlMs: number,
  ): Promise<void>;
  consumeChallenge(
    phone: string,
    candidateHash: string,
    maxAttempts: number,
  ): Promise<'ok' | 'invalid' | 'not-found'>;
  createProof(tokenHash: string, phone: string, ttlMs: number): Promise<void>;
  consumeProof(tokenHash: string, phone: string): Promise<boolean>;
  /**
   * Returns true when the call is within budget. Increments the scoped
   * counter; the window slides per key with the given TTL.
   */
  checkLimit(key: string, limit: number, windowMs: number): Promise<boolean>;
}

/** Upper bound per in-memory map so process-local state cannot grow forever. */
export const MEMORY_STATE_MAX_ENTRIES = 10_000;

interface ChallengeEntry {
  hash: string;
  attempts: number;
  expiresAt: number;
}

interface ProofEntry {
  phone: string;
  expiresAt: number;
}

interface LimitEntry {
  count: number;
  resetAt: number;
}

export function constantTimeEqualHex(a: string, b: string): boolean {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/**
 * Single-instance OtpState for tests and local development.
 * Atomicity comes from the single-threaded event loop (every method runs to
 * its next await without interleaving observable state). Production replicas
 * must use the Redis implementation so challenges, proofs and limits are
 * shared with atomic expiry.
 */
export class MemoryOtpState implements OtpState {
  private readonly challenges = new Map<string, ChallengeEntry>();
  private readonly proofs = new Map<string, ProofEntry>();
  private readonly limits = new Map<string, LimitEntry>();

  /** Test hook: current entry counts per map. */
  sizes(): { challenges: number; proofs: number; limits: number } {
    return {
      challenges: this.challenges.size,
      proofs: this.proofs.size,
      limits: this.limits.size,
    };
  }

  async requestChallenge(
    phone: string,
    codeHash: string,
    ttlMs: number,
  ): Promise<void> {
    this.store(this.challenges, phone, {
      hash: codeHash,
      attempts: 0,
      expiresAt: Date.now() + ttlMs,
    });
  }

  async consumeChallenge(
    phone: string,
    candidateHash: string,
    maxAttempts: number,
  ): Promise<'ok' | 'invalid' | 'not-found'> {
    const entry = this.takeIfFresh(this.challenges, phone);
    if (!entry) return 'not-found';
    if (entry.attempts >= maxAttempts) {
      this.challenges.delete(phone);
      return 'not-found';
    }
    entry.attempts += 1;
    if (!constantTimeEqualHex(entry.hash, candidateHash)) {
      if (entry.attempts >= maxAttempts) this.challenges.delete(phone);
      return 'invalid';
    }
    this.challenges.delete(phone);
    return 'ok';
  }

  async createProof(
    tokenHash: string,
    phone: string,
    ttlMs: number,
  ): Promise<void> {
    this.store(this.proofs, tokenHash, {
      phone,
      expiresAt: Date.now() + ttlMs,
    });
  }

  async consumeProof(tokenHash: string, phone: string): Promise<boolean> {
    const entry = this.proofs.get(tokenHash);
    this.proofs.delete(tokenHash);
    if (!entry || entry.expiresAt <= Date.now() || entry.phone !== phone) {
      return false;
    }
    return true;
  }

  async checkLimit(
    key: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    const now = Date.now();
    const current = this.limits.get(key);
    if (!current || current.resetAt <= now) {
      this.store(this.limits, key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (current.count >= limit) return false;
    current.count += 1;
    return true;
  }

  private takeIfFresh<T extends { expiresAt: number }>(
    map: Map<string, T>,
    key: string,
  ): T | undefined {
    const entry = map.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      map.delete(key);
      return undefined;
    }
    return entry;
  }

  private store<T extends { expiresAt?: number; resetAt?: number }>(
    map: Map<string, T>,
    key: string,
    value: T,
  ): void {
    if (!map.has(key) && map.size >= MEMORY_STATE_MAX_ENTRIES) {
      this.evictExpired(map);
      while (map.size >= MEMORY_STATE_MAX_ENTRIES) {
        const oldest = map.keys().next();
        if (oldest.done) break;
        map.delete(oldest.value);
      }
    }
    map.set(key, value);
  }

  private evictExpired<T extends { expiresAt?: number; resetAt?: number }>(
    map: Map<string, T>,
  ): void {
    const now = Date.now();
    for (const [key, value] of map) {
      const deadline = value.expiresAt ?? value.resetAt;
      if (deadline !== undefined && deadline <= now) map.delete(key);
    }
  }
}
