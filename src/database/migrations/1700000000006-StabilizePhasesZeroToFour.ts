import { MigrationInterface, QueryRunner } from 'typeorm';

export class StabilizePhasesZeroToFour1700000000006 implements MigrationInterface {
  name = 'StabilizePhasesZeroToFour1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "deliveries"
        ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1
    `);

    const constraints = [
      `ALTER TABLE "users" ADD CONSTRAINT "chk_users_status" CHECK (status IN ('active','suspended','deleted')) NOT VALID`,
      `ALTER TABLE "driver_profiles" ADD CONSTRAINT "chk_driver_availability" CHECK (availability IN ('offline','online','on_delivery')) NOT VALID`,
      `ALTER TABLE "driver_profiles" ADD CONSTRAINT "chk_driver_rating" CHECK (rating >= 0 AND rating <= 5.00) NOT VALID`,
      `ALTER TABLE "admin_role_assignments" ADD CONSTRAINT "chk_admin_role" CHECK (role IN ('super_admin','admin','support')) NOT VALID`,
      `ALTER TABLE "businesses" ADD CONSTRAINT "chk_business_status" CHECK (status IN ('active','suspended')) NOT VALID`,
      `ALTER TABLE "business_members" ADD CONSTRAINT "chk_business_member_role" CHECK (role IN ('owner','manager','operator','accountant')) NOT VALID`,
      `ALTER TABLE "business_members" ADD CONSTRAINT "chk_business_member_status" CHECK (status IN ('active','suspended')) NOT VALID`,
      `ALTER TABLE "delivery_zones" ADD CONSTRAINT "chk_delivery_zone_boundary" CHECK (ST_SRID(boundary) = 4326 AND GeometryType(boundary) = 'POLYGON' AND ST_IsValid(boundary)) NOT VALID`,
      `ALTER TABLE "deliveries" ADD CONSTRAINT "chk_delivery_status" CHECK (status IN ('CREATED','ASSIGNED','ACCEPTED','PICKED_UP','IN_TRANSIT','ARRIVED','DELIVERED','FAILED','RESCHEDULED','RETURNED','CANCELLED')) NOT VALID`,
      `ALTER TABLE "deliveries" ADD CONSTRAINT "chk_delivery_payment_method" CHECK (payment_method IN ('cod','prepaid','account')) NOT VALID`,
      `ALTER TABLE "deliveries" ADD CONSTRAINT "chk_delivery_collectable" CHECK (collectable_amount = cod_amount + delivery_fee) NOT VALID`,
      `ALTER TABLE "deliveries" ADD CONSTRAINT "chk_delivery_version" CHECK (version >= 1) NOT VALID`,
      `ALTER TABLE "recipients" ADD CONSTRAINT "chk_recipient_coordinates_required" CHECK (latitude IS NOT NULL AND longitude IS NOT NULL) NOT VALID`,
      `ALTER TABLE "delivery_addresses" ADD CONSTRAINT "chk_delivery_address_coordinates_required" CHECK (latitude IS NOT NULL AND longitude IS NOT NULL) NOT VALID`,
      `ALTER TABLE "delivery_addresses" ADD CONSTRAINT "chk_delivery_address_kind" CHECK (kind = 'pickup') NOT VALID`,
      `ALTER TABLE "delivery_status_history" ADD CONSTRAINT "chk_delivery_history_actor" CHECK (actor_type IN ('user','business','driver','admin','system')) NOT VALID`,
      `ALTER TABLE "delivery_status_history" ADD CONSTRAINT "chk_delivery_history_from_status" CHECK (from_status IS NULL OR from_status IN ('CREATED','ASSIGNED','ACCEPTED','PICKED_UP','IN_TRANSIT','ARRIVED','DELIVERED','FAILED','RESCHEDULED','RETURNED','CANCELLED')) NOT VALID`,
      `ALTER TABLE "delivery_status_history" ADD CONSTRAINT "chk_delivery_history_to_status" CHECK (to_status IN ('CREATED','ASSIGNED','ACCEPTED','PICKED_UP','IN_TRANSIT','ARRIVED','DELIVERED','FAILED','RESCHEDULED','RETURNED','CANCELLED')) NOT VALID`,
    ];
    for (const statement of constraints) await queryRunner.query(statement);

    const validationTargets = [
      ['users', 'chk_users_status'],
      ['driver_profiles', 'chk_driver_availability'],
      ['driver_profiles', 'chk_driver_rating'],
      ['admin_role_assignments', 'chk_admin_role'],
      ['businesses', 'chk_business_status'],
      ['business_members', 'chk_business_member_role'],
      ['business_members', 'chk_business_member_status'],
      ['delivery_zones', 'chk_delivery_zone_boundary'],
      ['deliveries', 'chk_delivery_status'],
      ['deliveries', 'chk_delivery_payment_method'],
      ['deliveries', 'chk_delivery_collectable'],
      ['deliveries', 'chk_delivery_version'],
      ['recipients', 'chk_recipient_coordinates_required'],
      ['delivery_addresses', 'chk_delivery_address_coordinates_required'],
      ['delivery_addresses', 'chk_delivery_address_kind'],
      ['delivery_status_history', 'chk_delivery_history_actor'],
      ['delivery_status_history', 'chk_delivery_history_from_status'],
      ['delivery_status_history', 'chk_delivery_history_to_status'],
    ];
    for (const [table, constraint] of validationTargets) {
      await queryRunner.query(`
        DO $$
        BEGIN
          BEGIN
            ALTER TABLE "${table}" VALIDATE CONSTRAINT "${constraint}";
          EXCEPTION WHEN check_violation THEN
            RAISE NOTICE 'Constraint ${constraint} left NOT VALID because existing rows require cleanup';
          END;
        END $$
      `);
    }

    await queryRunner.query(`
      CREATE INDEX "pidx_deliveries_active"
        ON "deliveries" ("status", "created_at", "id")
        WHERE "status" NOT IN ('DELIVERED','CANCELLED','RETURNED')
    `);
    await queryRunner.query(`
      CREATE INDEX "pidx_deliveries_business_active"
        ON "deliveries" ("business_id", "created_at", "id")
        WHERE "business_id" IS NOT NULL
          AND "status" NOT IN ('DELIVERED','CANCELLED','RETURNED')
    `);
    await queryRunner.query(`
      CREATE INDEX "pidx_business_members_active_owners"
        ON "business_members" ("business_id")
        WHERE "role" = 'owner' AND "status" = 'active' AND "deleted_at" IS NULL
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_update_delete()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'Table % is immutable. Rows cannot be updated or deleted.', TG_TABLE_NAME;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql
    `);
    for (const [trigger, table] of [
      ['trg_recipients_immutable', 'recipients'],
      ['trg_delivery_addresses_immutable', 'delivery_addresses'],
      ['trg_delivery_status_history_immutable', 'delivery_status_history'],
    ]) {
      await queryRunner.query(`
        CREATE TRIGGER "${trigger}"
          BEFORE UPDATE OR DELETE ON "${table}"
          FOR EACH ROW EXECUTE FUNCTION prevent_update_delete()
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const [trigger, table] of [
      ['trg_delivery_status_history_immutable', 'delivery_status_history'],
      ['trg_delivery_addresses_immutable', 'delivery_addresses'],
      ['trg_recipients_immutable', 'recipients'],
    ]) {
      await queryRunner.query(
        `DROP TRIGGER IF EXISTS "${trigger}" ON "${table}"`,
      );
    }
    await queryRunner.query(`DROP FUNCTION IF EXISTS prevent_update_delete()`);
    await queryRunner.query(
      `DROP INDEX IF EXISTS "pidx_business_members_active_owners"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "pidx_deliveries_business_active"`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "pidx_deliveries_active"`);

    for (const [table, constraint] of [
      ['delivery_status_history', 'chk_delivery_history_to_status'],
      ['delivery_status_history', 'chk_delivery_history_from_status'],
      ['delivery_status_history', 'chk_delivery_history_actor'],
      ['delivery_addresses', 'chk_delivery_address_kind'],
      ['delivery_addresses', 'chk_delivery_address_coordinates_required'],
      ['recipients', 'chk_recipient_coordinates_required'],
      ['deliveries', 'chk_delivery_version'],
      ['deliveries', 'chk_delivery_collectable'],
      ['deliveries', 'chk_delivery_payment_method'],
      ['deliveries', 'chk_delivery_status'],
      ['delivery_zones', 'chk_delivery_zone_boundary'],
      ['business_members', 'chk_business_member_status'],
      ['business_members', 'chk_business_member_role'],
      ['businesses', 'chk_business_status'],
      ['admin_role_assignments', 'chk_admin_role'],
      ['driver_profiles', 'chk_driver_rating'],
      ['driver_profiles', 'chk_driver_availability'],
      ['users', 'chk_users_status'],
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT IF EXISTS "${constraint}"`,
      );
    }
    await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "version"`);
  }
}
