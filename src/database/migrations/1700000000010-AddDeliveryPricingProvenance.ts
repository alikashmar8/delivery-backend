import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C01: quote provenance on deliveries. All columns nullable so pre-C01 rows
 * are unaffected; new rows always populate them at creation.
 */
export class AddDeliveryPricingProvenance1700000000010
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE deliveries
        ADD COLUMN "pricingRuleId" uuid NULL,
        ADD COLUMN "quotedDistanceKm" numeric(12, 6) NULL,
        ADD COLUMN "feeBreakdown" jsonb NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_deliveries_pricingRuleId" ON deliveries ("pricingRuleId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_deliveries_pricingRuleId"`,
    );
    await queryRunner.query(
      `ALTER TABLE deliveries
        DROP COLUMN IF EXISTS "feeBreakdown",
        DROP COLUMN IF EXISTS "quotedDistanceKm",
        DROP COLUMN IF EXISTS "pricingRuleId"`,
    );
  }
}
