import { createHash } from 'node:crypto';

/**
 * Compute SHA-256 hash of request payload.
 * Used for payload conflict detection in idempotency.
 *
 * @param payload Request body object
 * @returns hex-encoded SHA-256 hash
 */
export function hashPayload(payload: unknown): string {
  const json = JSON.stringify(payload);
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Validate idempotency key format.
 * Accepts UUID v4 or hex strings (32-64 chars).
 *
 * @param key Idempotency-Key header value
 * @returns true if valid format
 */
export function isValidIdempotencyKey(key: unknown): boolean {
  if (typeof key !== 'string') return false;
  // Accept UUID v4 or hex strings (32-64 chars)
  const uuidv4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const hex = /^[0-9a-f]{32,64}$/i;
  return uuidv4.test(key) || hex.test(key);
}
