import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateIdentityTables1700000000001 implements MigrationInterface {
  name = 'CreateIdentityTables1700000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Users ──
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "phone"         VARCHAR(20) NOT NULL,
        "email"         VARCHAR(255),
        "password_hash" VARCHAR(255),
        "display_name"  VARCHAR(255) NOT NULL,
        "locale"        VARCHAR(10) NOT NULL DEFAULT 'en',
        "country"       VARCHAR(2) NOT NULL DEFAULT 'LB',
        "status"        VARCHAR(20) NOT NULL DEFAULT 'active',
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"    TIMESTAMPTZ
      )
    `);

    // Partial unique indexes (exclude soft-deleted)
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uidx_users_phone"
        ON "users" ("phone")
        WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uidx_users_email"
        ON "users" ("email")
        WHERE "email" IS NOT NULL AND "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_users_status"
        ON "users" ("status")
    `);

    // ── Refresh Tokens ──
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id"    UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token_hash" VARCHAR(64) NOT NULL,
        "expires_at" TIMESTAMPTZ NOT NULL,
        "revoked_at" TIMESTAMPTZ,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uidx_refresh_tokens_token_hash"
        ON "refresh_tokens" ("token_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_refresh_tokens_user_id"
        ON "refresh_tokens" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_refresh_tokens_expires"
        ON "refresh_tokens" ("expires_at")
        WHERE "revoked_at" IS NULL
    `);

    // ── Driver Profiles ──
    await queryRunner.query(`
      CREATE TABLE "driver_profiles" (
        "id"           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id"      UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE RESTRICT,
        "vehicle_type" VARCHAR(50) NOT NULL,
        "vehicle_plate" VARCHAR(20),
        "license"      VARCHAR(50),
        "availability" VARCHAR(20) NOT NULL DEFAULT 'offline',
        "rating"       NUMERIC(3,2) NOT NULL DEFAULT 0.00,
        "active"       BOOLEAN NOT NULL DEFAULT true,
        "balance"      BIGINT NOT NULL DEFAULT 0,
        "currency"     VARCHAR(3) NOT NULL DEFAULT 'USD',
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_driver_profiles_availability"
        ON "driver_profiles" ("availability")
        WHERE "active" = true
    `);

    // ── Admin Role Assignments ──
    await queryRunner.query(`
      CREATE TABLE "admin_role_assignments" (
        "id"             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id"        UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "role"           VARCHAR(20) NOT NULL,
        "active"         BOOLEAN NOT NULL DEFAULT true,
        "granted_by_id"  UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_admin_role_assignments_user_id"
        ON "admin_role_assignments" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_admin_role_assignments_role_active"
        ON "admin_role_assignments" ("role", "active")
        WHERE "active" = true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "admin_role_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "driver_profiles"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "refresh_tokens"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
