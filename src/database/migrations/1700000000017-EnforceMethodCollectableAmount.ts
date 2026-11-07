import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnforceMethodCollectableAmount1700000000017 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // Validate existing rows without rewriting committed commercial history.
    await queryRunner.query(`
      ALTER TABLE deliveries
        DROP CONSTRAINT chk_delivery_collectable,
        ADD CONSTRAINT chk_delivery_collectable CHECK (
          "collectableAmount" = CASE
            WHEN "paymentMethod" = 'cod'
              THEN "codAmount"::numeric + "deliveryFee"::numeric
            ELSE "codAmount"::numeric
          END
        )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Refuse downgrade when valid non-cash-fee rows cannot satisfy the old rule.
    await queryRunner.query(`
      ALTER TABLE deliveries
        DROP CONSTRAINT chk_delivery_collectable,
        ADD CONSTRAINT chk_delivery_collectable CHECK (
          "collectableAmount" = "codAmount"::numeric + "deliveryFee"::numeric
        )
    `);
  }
}
