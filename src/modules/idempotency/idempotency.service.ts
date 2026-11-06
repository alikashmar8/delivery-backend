import {
  ConflictException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { IdempotencyKey } from './entities/idempotency-key.entity';
import { hashPayload, isValidIdempotencyKey } from './idempotency.util';

/**
 * Service for managing idempotent operations.
 *
 * Responsibilities:
 * - Extract and validate Idempotency-Key header
 * - Check for existing idempotency records (replay response)
 * - Detect payload conflicts (same key, different data)
 * - Record idempotent operations
 * - Cleanup expired records
 */
@Injectable()
export class IdempotencyService {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly idempotencyRepo: Repository<IdempotencyKey>,
  ) {}

  /**
   * Extract and validate Idempotency-Key from request headers.
   * @param headers HTTP request headers
   * @returns Validated idempotency key, or null if not present
   * @throws BadRequestException if header present but invalid format
   */
  extractKey(headers: Record<string, unknown>): string | null {
    const key = headers['idempotency-key'] as string | undefined;
    if (!key) return null;
    if (!isValidIdempotencyKey(key)) {
      throw new BadRequestException(
        'Invalid Idempotency-Key format. Expected UUID v4 or 32-64 char hex string.',
      );
    }
    return key;
  }

  /**
   * Check for existing idempotency record.
   * If found and payload matches, return cached response (replay).
   * If found and payload differs, throw 409 Conflict.
   * If not found, return null (proceed with operation).
   *
   * @param userId Actor's user ID
   * @param operationType Operation type (e.g., 'delivery.create')
   * @param idempotencyKey Client's idempotency key
   * @param payload Request payload for conflict detection
   * @returns Cached response if replay, null if new operation, throws if conflict
   */
  async checkAndReplay(
    userId: string,
    operationType: string,
    idempotencyKey: string,
    payload: unknown,
    manager?: EntityManager,
  ): Promise<unknown | null> {
    const payloadHash = hashPayload(payload);

    const existing = await this.findExisting(
      userId,
      operationType,
      idempotencyKey,
      manager,
    );

    if (!existing) {
      return null; // New operation, proceed
    }

    // Found existing record
    if (existing.payloadHash !== payloadHash) {
      // Payload mismatch: client sent same key with different data
      throw new ConflictException(
        'Conflicting request: same Idempotency-Key with different payload. ' +
          'Use a new Idempotency-Key for different operations.',
      );
    }

    // Payload matches: return cached response
    return existing.responsePayload;
  }

  async findExisting(
    userId: string,
    operationType: string,
    idempotencyKey: string,
    manager?: EntityManager,
  ): Promise<IdempotencyKey | null> {
    const repository =
      manager?.getRepository(IdempotencyKey) ?? this.idempotencyRepo;
    return await repository.findOne({
      where: {
        userId,
        operationType,
        idempotencyKey,
      },
    });
  }

  /**
   * Record an idempotent operation with its result.
   * Called after successful execution to cache the response.
   *
   * Must be called within the same transaction as the operation
   * to ensure atomicity.
   *
   * @param userId Actor's user ID
   * @param operationType Operation type
   * @param idempotencyKey Client's idempotency key
   * @param payload Request payload
   * @param resultantAggregateId ID of created/modified resource
   * @param responsePayload Response to cache
   * @param ttlHours TTL in hours (default 24)
   */
  async record(
    userId: string,
    operationType: string,
    idempotencyKey: string,
    payload: unknown,
    resultantAggregateId: string,
    responsePayload: unknown,
    ttlHours: number = 24,
    manager?: EntityManager,
  ): Promise<IdempotencyKey> {
    const payloadHash = hashPayload(payload);
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    const repository =
      manager?.getRepository(IdempotencyKey) ?? this.idempotencyRepo;

    return await repository.save(
      repository.create({
        userId,
        operationType,
        idempotencyKey,
        payloadHash,
        resultantAggregateId,
        responsePayload,
        expiresAt,
      }),
    );
  }

  /**
   * Cleanup expired idempotency records.
   * Call periodically (e.g., via BullMQ job) to prevent unbounded table growth.
   *
   * @returns Number of deleted records
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.idempotencyRepo
      .createQueryBuilder()
      .delete()
      .where('expiresAt < :now', { now: new Date() })
      .execute();
    return result.affected ?? 0;
  }
}
