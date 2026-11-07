import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * C04 driver onboarding is an approval workflow, not an implicit operational
 * capability. Existing profiles keep their approved state; profiles created
 * after this migration begin inactive and offline.
 */
export class AddDriverCapabilityLifecycle1700000000012 implements MigrationInterface {
  name = 'AddDriverCapabilityLifecycle1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
        ALTER COLUMN "active" SET DEFAULT false
    `);
    await queryRunner.query(`
      UPDATE "driver_profiles"
        SET "availability" = 'offline'
        WHERE "active" = false AND "availability" <> 'offline'
    `);
    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
        ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1
    `);
    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
        ADD CONSTRAINT "chk_driver_profiles_active_availability"
        CHECK ("active" OR "availability" = 'offline') NOT VALID
    `);
    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
        ADD CONSTRAINT "chk_driver_profiles_version"
        CHECK ("version" >= 1) NOT VALID
    `);
    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
        VALIDATE CONSTRAINT "chk_driver_profiles_active_availability"
    `);
    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
        VALIDATE CONSTRAINT "chk_driver_profiles_version"
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_driver_profiles_active_created"
        ON "driver_profiles" ("active", "createdAt" DESC, "id" DESC)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_driver_profiles_active_created"`,
    );
    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
        DROP CONSTRAINT IF EXISTS "chk_driver_profiles_version"
    `);
    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
        DROP CONSTRAINT IF EXISTS "chk_driver_profiles_active_availability"
    `);
    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
        DROP COLUMN IF EXISTS "version"
    `);
    await queryRunner.query(`
      ALTER TABLE "driver_profiles"
        ALTER COLUMN "active" SET DEFAULT true
    `);
  }
}
