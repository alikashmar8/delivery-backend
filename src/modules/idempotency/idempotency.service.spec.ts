import { BadRequestException, ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, beforeEach } from 'vitest';
import { IdempotencyService } from './idempotency.service';

describe('IdempotencyService', () => {
  let service: IdempotencyService;
  let mockRepo: any;

  beforeEach(async () => {
    mockRepo = {
      findOne: async () => null,
      save: async (entity: any) => ({ ...entity, id: 'key-uuid' }),
      create: (data: any) => data,
      createQueryBuilder: () => ({
        delete: () => ({
          where: () => ({
            execute: async () => ({ affected: 5 }),
          }),
        }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyService,
        {
          provide: 'IdempotencyKeyRepository',
          useValue: mockRepo,
        },
      ],
    })
      .overrideProvider('IdempotencyKeyRepository')
      .useValue(mockRepo)
      .compile();

    service = module.get<IdempotencyService>(IdempotencyService);
    // Inject the mock repository
    (service as any).idempotencyRepo = mockRepo;
  });

  describe('extractKey', () => {
    it('returns null when idempotency-key header is absent', () => {
      const key = service.extractKey({});
      expect(key).toBeNull();
    });

    it('accepts UUID v4 format', () => {
      const uuidv4 = '550e8400-e29b-41d4-a716-446655440000';
      const key = service.extractKey({ 'idempotency-key': uuidv4 });
      expect(key).toBe(uuidv4);
    });

    it('accepts 32-64 character hex strings', () => {
      const hex32 = 'a'.repeat(32);
      const hex64 = 'a'.repeat(64);
      expect(service.extractKey({ 'idempotency-key': hex32 })).toBe(hex32);
      expect(service.extractKey({ 'idempotency-key': hex64 })).toBe(hex64);
    });

    it('rejects invalid format (non-hex, wrong length)', () => {
      expect(() =>
        service.extractKey({ 'idempotency-key': 'not-a-valid-key' }),
      ).toThrow(BadRequestException);
      expect(() =>
        service.extractKey({ 'idempotency-key': 'a'.repeat(31) }),
      ).toThrow(BadRequestException);
    });

    it('rejects non-string values', () => {
      expect(() => service.extractKey({ 'idempotency-key': 12345 })).toThrow(
        BadRequestException,
      );
    });
  });

  describe('checkAndReplay', () => {
    it('returns null when no existing record found', async () => {
      mockRepo.findOne = async () => null;
      const result = await service.checkAndReplay(
        'user-1',
        'delivery.create',
        'key-1',
        { test: 'data' },
      );
      expect(result).toBeNull();
    });

    it('returns cached response when record exists with matching payload', async () => {
      const payload = { test: 'data' };
      const cachedResponse = { id: 'delivery-1', status: 'CREATED' };

      // Import hashPayload to calculate the same hash
      const { hashPayload } = await import('./idempotency.util');
      const payloadHash = hashPayload(payload);

      mockRepo.findOne = async () => ({
        payloadHash,
        responsePayload: cachedResponse,
      });

      const result = await service.checkAndReplay(
        'user-1',
        'delivery.create',
        'key-1',
        payload,
      );
      expect(result).toEqual(cachedResponse);
    });

    it('throws 409 Conflict when payload differs for same key', async () => {
      const wrongPayloadHash =
        'different_hash_value_1234567890abcdef1234567890abcdef12345678';
      mockRepo.findOne = async () => ({
        payloadHash: wrongPayloadHash,
        responsePayload: { id: 'delivery-1' },
      });

      await expect(
        service.checkAndReplay('user-1', 'delivery.create', 'key-1', {
          different: 'data',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('record', () => {
    it('saves idempotency record with correct structure', async () => {
      let savedEntity: any;
      mockRepo.save = async (entity: any) => {
        savedEntity = entity;
        return { ...entity, id: 'key-uuid' };
      };
      mockRepo.create = (data: any) => data;

      const userId = 'user-1';
      const operationType = 'delivery.create';
      const idempotencyKey = 'key-123';
      const payload = { test: 'data' };
      const aggregateId = 'delivery-1';
      const response = { id: 'delivery-1', status: 'CREATED' };

      await service.record(
        userId,
        operationType,
        idempotencyKey,
        payload,
        aggregateId,
        response,
        24,
      );

      expect(savedEntity.userId).toBe(userId);
      expect(savedEntity.operationType).toBe(operationType);
      expect(savedEntity.idempotencyKey).toBe(idempotencyKey);
      expect(savedEntity.resultantAggregateId).toBe(aggregateId);
      expect(savedEntity.responsePayload).toEqual(response);
      expect(typeof savedEntity.payloadHash).toBe('string');
      expect(savedEntity.payloadHash.length).toBe(64); // SHA-256 hex length
    });

    it('sets correct expiry time (24 hours by default)', async () => {
      let savedEntity: any;
      mockRepo.save = async (entity: any) => {
        savedEntity = entity;
        return entity;
      };
      mockRepo.create = (data: any) => data;

      const now = Date.now();
      await service.record(
        'user-1',
        'delivery.create',
        'key-1',
        {},
        'agg-1',
        {},
      );

      const expiryTime = savedEntity.expiresAt.getTime();
      const expectedMinTime = now + 23 * 60 * 60 * 1000; // 23 hours (allow 1h variance)
      const expectedMaxTime = now + 25 * 60 * 60 * 1000; // 25 hours

      expect(expiryTime).toBeGreaterThan(expectedMinTime);
      expect(expiryTime).toBeLessThan(expectedMaxTime);
    });
  });

  describe('cleanupExpired', () => {
    it('executes cleanup query and returns affected count', async () => {
      let executedQuery:
        { condition: string; parameters: { now: Date } } | undefined;
      mockRepo.createQueryBuilder = () => ({
        delete: () => ({
          where: (condition: string, parameters: { now: Date }) => {
            executedQuery = { condition, parameters };
            return {
              execute: async () => ({ affected: 15 }),
            };
          },
        }),
      });

      const result = await service.cleanupExpired();
      expect(result).toBe(15);
      expect(executedQuery).toMatchObject({
        condition: 'expiresAt < :now',
        parameters: { now: expect.any(Date) },
      });
    });
  });
});
