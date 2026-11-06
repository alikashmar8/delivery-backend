import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * IdempotencyKey entity for persisted request idempotency.
 *
 * Purpose: Track idempotent operations per user to ensure:
 * - Repeated requests with same key return cached response
 * - Same key + different payload is rejected (409 Conflict)
 * - Concurrent requests with same key produce exactly one aggregate
 *
 * Scope: (userId, operationType, idempotencyKey) uniqueness
 * Storage: PostgreSQL (survives service restart, required for financial operations)
 * TTL: 24 hours from creation (configurable via IDEMPOTENCY_KEY_TTL_HOURS env var)
 */
@Entity('idempotency_keys')
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'userId' })
  userId!: string;

  /**
   * Operation type (e.g., 'delivery.create', 'delivery.transition', 'delivery.cancel').
   * Allows same idempotency key to be reused across different operation types for the same user.
   */
  @Column({ type: 'varchar', length: 50, name: 'operationType' })
  operationType!: string;

  /**
   * Client-provided idempotency key (UUID v4 recommended).
   * Combined with userId and operationType for uniqueness.
   */
  @Column({ type: 'varchar', length: 255, name: 'idempotencyKey' })
  idempotencyKey!: string;

  /**
   * SHA-256 hash of the request payload.
   * Used to detect conflicting payloads (same key, different data).
   * Clients must use same payload for retries; different payload = 409 Conflict.
   */
  @Column({ type: 'varchar', length: 64, name: 'payloadHash' })
  payloadHash!: string;

  /**
   * ID of the resource created by this operation.
   * For delivery.create: the created Delivery.id
   * For transitions: the updated Delivery.id
   */
  @Column({ type: 'uuid', name: 'resultantAggregateId' })
  resultantAggregateId!: string;

  /**
   * Cached response payload (JSONB) for replay.
   * Returned directly on idempotent retry without re-executing business logic.
   */
  @Column({ type: 'jsonb', name: 'responsePayload' })
  responsePayload!: unknown;

  /**
   * Expiration timestamp (24 hours from creation by default).
   * After this time, the idempotency key can be garbage collected.
   * Prevents unbounded table growth.
   */
  @Column({ type: 'timestamptz', name: 'expiresAt' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', default: () => 'now()', name: 'createdAt' })
  createdAt!: Date;
}
