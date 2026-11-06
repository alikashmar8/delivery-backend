import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBusinessTables1700000000002 implements MigrationInterface {
  name = 'CreateBusinessTables1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Businesses ──
    await queryRunner.query(`
      CREATE TABLE "businesses" (
        "id"                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name"              VARCHAR(255) NOT NULL,
        "slug"              VARCHAR(255) NOT NULL,
        "status"            VARCHAR(20) NOT NULL DEFAULT 'active',
        "country"           VARCHAR(2) NOT NULL DEFAULT 'LB',
        "currency"          VARCHAR(3) NOT NULL DEFAULT 'USD',
        "settlement_config" JSONB NOT NULL DEFAULT '{}',
        "contact_phone"     VARCHAR(20) NOT NULL,
        "legal_name"        VARCHAR(255),
        "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uidx_businesses_slug"
        ON "businesses" ("slug")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_businesses_status"
        ON "businesses" ("status")
    `);

    // ── Business Members ──
    await queryRunner.query(`
      CREATE TABLE "business_members" (
        "id"          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "business_id" UUID NOT NULL REFERENCES "businesses"("id") ON DELETE RESTRICT,
        "user_id"     UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "role"        VARCHAR(20) NOT NULL DEFAULT 'owner',
        "status"      VARCHAR(20) NOT NULL DEFAULT 'active',
        "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"  TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uidx_business_members_business_user"
        ON "business_members" ("business_id", "user_id")
        WHERE "deleted_at" IS NULL
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_business_members_user_id"
        ON "business_members" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_business_members_business_id"
        ON "business_members" ("business_id")
        WHERE "deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "business_members"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "businesses"`);
  }
}
