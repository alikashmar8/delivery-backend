import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeliveryCore1700000000005 implements MigrationInterface {
  name = 'CreateDeliveryCore1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Deliveries ──
    await queryRunner.query(`
      CREATE TABLE "deliveries" (
        "id"                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tracking_code"         VARCHAR(50) NOT NULL,
        "secure_tracking_token" VARCHAR(64) NOT NULL,
        "created_by_user_id"    UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "business_id"           UUID REFERENCES "businesses"("id") ON DELETE RESTRICT,
        "driver_id"             UUID REFERENCES "driver_profiles"("id") ON DELETE SET NULL,
        "zone_id"               UUID REFERENCES "delivery_zones"("id") ON DELETE SET NULL,
        "status"                VARCHAR(20) NOT NULL DEFAULT 'CREATED',
        "currency"              VARCHAR(3) NOT NULL DEFAULT 'USD',
        "cod_amount"            BIGINT NOT NULL DEFAULT 0 CHECK (cod_amount >= 0),
        "delivery_fee"          BIGINT NOT NULL DEFAULT 0 CHECK (delivery_fee >= 0),
        "collectable_amount"  BIGINT NOT NULL DEFAULT 0 CHECK (collectable_amount >= 0),
        "payment_method"       VARCHAR(20) NOT NULL DEFAULT 'cod',
        "notes"                TEXT,
        "scheduled_at"         TIMESTAMPTZ,
        "picked_up_at"         TIMESTAMPTZ,
        "delivered_at"         TIMESTAMPTZ,
        "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uidx_deliveries_tracking_code" ON "deliveries" ("tracking_code")`);
    await queryRunner.query(`CREATE UNIQUE INDEX "uidx_deliveries_secure_tracking_token" ON "deliveries" ("secure_tracking_token")`);
    await queryRunner.query(`CREATE INDEX "idx_deliveries_business_status" ON "deliveries" ("business_id","status")`);
    await queryRunner.query(`CREATE INDEX "idx_deliveries_created_by_status" ON "deliveries" ("created_by_user_id","status")`);
    await queryRunner.query(`CREATE INDEX "idx_deliveries_driver_status" ON "deliveries" ("driver_id","status")`);
    await queryRunner.query(`CREATE INDEX "idx_deliveries_status" ON "deliveries" ("status")`);
    await queryRunner.query(`CREATE INDEX "idx_deliveries_created_at" ON "deliveries" ("created_at")`);

    // ── Recipients (immutable snapshot) ──
    await queryRunner.query(`
      CREATE TABLE "recipients" (
        "id"            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "delivery_id"  UUID NOT NULL UNIQUE REFERENCES "deliveries"("id") ON DELETE CASCADE,
        "user_id"      UUID REFERENCES "users"("id") ON DELETE SET NULL,
        "name"         VARCHAR(255) NOT NULL,
        "phone"        VARCHAR(20) NOT NULL,
        "country_code" VARCHAR(2) NOT NULL DEFAULT 'LB',
        "region_id"    UUID REFERENCES "regions"("id") ON DELETE SET NULL,
        "city"         VARCHAR(100) NOT NULL,
        "street"       VARCHAR(255),
        "building"     VARCHAR(100),
        "floor"        VARCHAR(10),
        "apartment"    VARCHAR(20),
        "landmark"     VARCHAR(255),
        "instructions" TEXT,
        "latitude"     NUMERIC(10,7) CHECK (latitude BETWEEN -90 AND 90),
        "longitude"    NUMERIC(10,7) CHECK (longitude BETWEEN -180 AND 180),
        "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uidx_recipients_delivery" ON "recipients" ("delivery_id")`);
    await queryRunner.query(`CREATE INDEX "idx_recipients_user_id" ON "recipients" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_recipients_phone" ON "recipients" ("phone")`);

    // ── Delivery Addresses (immutable pickup snapshot) ──
    await queryRunner.query(`
      CREATE TABLE "delivery_addresses" (
        "id"             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "delivery_id"    UUID NOT NULL UNIQUE REFERENCES "deliveries"("id") ON DELETE CASCADE,
        "kind"           VARCHAR(20) NOT NULL DEFAULT 'pickup',
        "country_code"   VARCHAR(2) NOT NULL DEFAULT 'LB',
        "region_id"      UUID REFERENCES "regions"("id") ON DELETE SET NULL,
        "city"           VARCHAR(100) NOT NULL,
        "street"         VARCHAR(255),
        "building"       VARCHAR(100),
        "floor"          VARCHAR(10),
        "apartment"      VARCHAR(20),
        "landmark"       VARCHAR(255),
        "instructions"   TEXT,
        "latitude"       NUMERIC(10,7) CHECK (latitude BETWEEN -90 AND 90),
        "longitude"      NUMERIC(10,7) CHECK (longitude BETWEEN -180 AND 180),
        "contact_name"   VARCHAR(255),
        "contact_phone"  VARCHAR(20),
        "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "uidx_delivery_addresses_delivery" ON "delivery_addresses" ("delivery_id")`);

    // ── Delivery Status History ──
    await queryRunner.query(`
      CREATE TABLE "delivery_status_history" (
        "id"           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "delivery_id"  UUID NOT NULL REFERENCES "deliveries"("id") ON DELETE CASCADE,
        "from_status"  VARCHAR(20),
        "to_status"    VARCHAR(20) NOT NULL,
        "actor_type"   VARCHAR(20) NOT NULL,
        "actor_id"     UUID,
        "reason"       TEXT,
        "note"         TEXT,
        "occurred_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_delivery_status_history_delivery" ON "delivery_status_history" ("delivery_id","occurred_at")`);
    await queryRunner.query(`CREATE INDEX "idx_delivery_status_history_to_status" ON "delivery_status_history" ("to_status","occurred_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_status_history"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "delivery_addresses"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "recipients"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deliveries"`);
  }
}
