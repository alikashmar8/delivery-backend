import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitExtensionsAndEnums1700000000000 implements MigrationInterface {
  name = 'InitExtensionsAndEnums1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extensions
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "postgis"`);

    // Enums
    await queryRunner.query(`
      CREATE TYPE "delivery_status" AS ENUM (
        'CREATED', 'ASSIGNED', 'ACCEPTED', 'PICKED_UP', 'IN_TRANSIT',
        'ARRIVED', 'DELIVERED', 'FAILED', 'RESCHEDULED', 'RETURNED', 'CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "payment_method" AS ENUM ('cod', 'prepaid', 'account')
    `);

    await queryRunner.query(`
      CREATE TYPE "beneficiary_type" AS ENUM ('user', 'business', 'platform')
    `);

    await queryRunner.query(`
      CREATE TYPE "ledger_entry_type" AS ENUM (
        'COD_COLLECTED', 'COD_PAYABLE', 'DELIVERY_FEE_CHARGED',
        'DRIVER_EARNING', 'PLATFORM_DELIVERY_REVENUE',
        'DRIVER_DAILY_CHARGE', 'DRIVER_MONTHLY_CHARGE',
        'SETTLEMENT', 'REFUND', 'ADJUSTMENT', 'REVERSAL'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "driver_charge_type" AS ENUM ('daily', 'monthly', 'manual')
    `);

    await queryRunner.query(`
      CREATE TYPE "driver_charge_status" AS ENUM (
        'generated', 'pending', 'paid', 'waived', 'overdue'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "settlement_status" AS ENUM (
        'draft', 'pending', 'paid', 'cancelled'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "notification_recipient_type" AS ENUM (
        'user', 'recipient_contact', 'anonymous'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "notification_channel" AS ENUM (
        'push', 'sms', 'whatsapp', 'email'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "notification_status" AS ENUM (
        'queued', 'sent', 'failed'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_channel"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_recipient_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "settlement_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "driver_charge_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "driver_charge_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "ledger_entry_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "beneficiary_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payment_method"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "delivery_status"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "postgis"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
