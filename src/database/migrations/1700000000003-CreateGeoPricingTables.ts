import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGeoPricingTables1700000000003 implements MigrationInterface {
  name = 'CreateGeoPricingTables1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Regions ──
    await queryRunner.query(`
      CREATE TABLE "regions" (
        "id"            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "type"          VARCHAR(20) NOT NULL CHECK (type IN ('country','governorate','district','area')),
        "code"          VARCHAR(20) NOT NULL,
        "name"          VARCHAR(255) NOT NULL,
        "parent_id"     UUID REFERENCES "regions"("id") ON DELETE SET NULL,
        "country_code"  VARCHAR(2) NOT NULL DEFAULT 'LB',
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uidx_regions_code_country" ON "regions" ("code","country_code")`);
    await queryRunner.query(`CREATE INDEX "idx_regions_parent_type" ON "regions" ("parent_id","type")`);
    await queryRunner.query(`CREATE INDEX "idx_regions_country_code" ON "regions" ("country_code")`);

    // ── Addresses ──
    await queryRunner.query(`
      CREATE TABLE "addresses" (
        "id"            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id"       UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "country_code"  VARCHAR(2) NOT NULL DEFAULT 'LB',
        "region_id"     UUID REFERENCES "regions"("id") ON DELETE SET NULL,
        "city"          VARCHAR(100) NOT NULL,
        "street"        VARCHAR(255),
        "building"      VARCHAR(100),
        "floor"         VARCHAR(10),
        "apartment"     VARCHAR(20),
        "landmark"      VARCHAR(255),
        "instructions"  TEXT,
        "latitude"      NUMERIC(10,7) CHECK (latitude BETWEEN -90 AND 90),
        "longitude"     NUMERIC(10,7) CHECK (longitude BETWEEN -180 AND 180),
        "label"         VARCHAR(50),
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "deleted_at"    TIMESTAMPTZ
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_addresses_user_id" ON "addresses" ("user_id") WHERE "deleted_at" IS NULL`);
    await queryRunner.query(`CREATE INDEX "idx_addresses_region_id" ON "addresses" ("region_id")`);

    // ── Delivery Zones ──
    await queryRunner.query(`
      CREATE TABLE "delivery_zones" (
        "id"            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "business_id"   UUID REFERENCES "businesses"("id") ON DELETE RESTRICT,
        "name"          VARCHAR(255) NOT NULL,
        "boundary"      GEOMETRY(Polygon, 4326) NOT NULL,
        "active"        BOOLEAN NOT NULL DEFAULT true,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_delivery_zones_business_id" ON "delivery_zones" ("business_id")`);
    await queryRunner.query(`CREATE INDEX "sidx_delivery_zones_boundary" ON "delivery_zones" USING GIST ("boundary")`);

    // ── Pricing Rules ──
    await queryRunner.query(`
      CREATE TABLE "pricing_rules" (
        "id"              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "business_id"     UUID REFERENCES "businesses"("id") ON DELETE RESTRICT,
        "zone_id"         UUID REFERENCES "delivery_zones"("id") ON DELETE SET NULL,
        "currency"        VARCHAR(3) NOT NULL DEFAULT 'USD',
        "base_fee"        BIGINT NOT NULL CHECK (base_fee >= 0),
        "per_km"          BIGINT CHECK (per_km IS NULL OR per_km >= 0),
        "zone_surcharge"  BIGINT NOT NULL DEFAULT 0 CHECK (zone_surcharge >= 0),
        "cod_fee_percent" NUMERIC(5,2) CHECK (cod_fee_percent IS NULL OR (cod_fee_percent >= 0 AND cod_fee_percent <= 100)),
        "priority"        INTEGER NOT NULL DEFAULT 0,
        "active"          BOOLEAN NOT NULL DEFAULT true,
        "effective_from"  TIMESTAMPTZ NOT NULL DEFAULT now(),
        "effective_to"    TIMESTAMPTZ,
        "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
        CHECK (effective_to IS NULL OR effective_to > effective_from)
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_pricing_rules_business_active_priority" ON "pricing_rules" ("business_id","active","priority") WHERE "active" = true`);
    await queryRunner.query(`CREATE INDEX "idx_pricing_rules_zone_id" ON "pricing_rules" ("zone_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pricing_rules"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_zones"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "addresses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "regions"`);
  }
}
