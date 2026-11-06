import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateIdempotencyTable1700000000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'idempotency_keys',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'userId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'operationType',
            type: 'varchar',
            length: '50' as any,
            isNullable: false,
          },
          {
            name: 'idempotencyKey',
            type: 'varchar',
            length: '255' as any,
            isNullable: false,
          },
          {
            name: 'payloadHash',
            type: 'varchar',
            length: '64' as any,
            isNullable: false,
          },
          {
            name: 'resultantAggregateId',
            type: 'uuid',
            isNullable: false,
            comment: 'The ID of the resource created by this idempotent operation',
          },
          {
            name: 'responsePayload',
            type: 'jsonb',
            isNullable: false,
            comment: 'Cached response for replay',
          },
          {
            name: 'expiresAt',
            type: 'timestamptz',
            isNullable: false,
            comment: '24 hour TTL from creation',
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
        // No database FK to users: keys are TTL-bounded (24h) and users are
        // soft-deleted, so a hard referential constraint adds no safety but
        // would require a matching ORM relation pair per the F06 rule.
        indices: [
          {
            columnNames: ['userId', 'operationType', 'idempotencyKey'],
            isUnique: true,
            name: 'idx_idempotency_keys_unique',
          },
          {
            columnNames: ['expiresAt'],
            name: 'idx_idempotency_keys_expiry',
          },
          {
            columnNames: ['resultantAggregateId'],
            name: 'idx_idempotency_keys_aggregate',
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('idempotency_keys', true);
  }
}

