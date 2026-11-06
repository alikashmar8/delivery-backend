import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateAuditTable1700000000009 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'audit_logs',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            default: 'gen_random_uuid()',
          },
          {
            name: 'actorId',
            type: 'uuid',
            isNullable: false,
            comment: 'User ID who performed the action',
          },
          {
            name: 'businessId',
            type: 'uuid',
            isNullable: true,
            comment: 'Business context for scoped actions',
          },
          {
            name: 'action',
            type: 'varchar',
            length: '50' as any,
            isNullable: false,
            comment: 'Action type (e.g., member.add, pricing.update)',
          },
          {
            name: 'entityType',
            type: 'varchar',
            length: '50' as any,
            isNullable: false,
            comment: 'Entity type affected (e.g., BusinessMember, PricingRule)',
          },
          {
            name: 'entityId',
            type: 'uuid',
            isNullable: false,
            comment: 'Entity ID affected',
          },
          {
            name: 'before',
            type: 'jsonb',
            isNullable: true,
            comment: 'State before action (null for creates)',
          },
          {
            name: 'after',
            type: 'jsonb',
            isNullable: true,
            comment: 'State after action (null for deletes)',
          },
          {
            name: 'ipAddress',
            type: 'inet',
            isNullable: true,
            comment: 'Request source IP address',
          },
          {
            name: 'userAgent',
            type: 'varchar',
            length: '500' as any,
            isNullable: true,
            comment: 'Client User-Agent header',
          },
          {
            name: 'createdAt',
            type: 'timestamptz',
            default: 'now()',
            isNullable: false,
          },
        ],
        indices: [
          {
            columnNames: ['actorId'],
            name: 'idx_audit_logs_actor',
          },
          {
            columnNames: ['businessId'],
            name: 'idx_audit_logs_business',
          },
          {
            columnNames: ['entityType', 'entityId'],
            name: 'idx_audit_logs_entity',
          },
          {
            columnNames: ['createdAt'],
            name: 'idx_audit_logs_created',
          },
        ],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('audit_logs', true);
  }
}
