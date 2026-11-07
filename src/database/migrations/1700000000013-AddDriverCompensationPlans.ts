import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDriverCompensationPlans1700000000013 implements MigrationInterface {
  name = 'AddDriverCompensationPlans1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    for (const table of [
      'businesses',
      'driver_profiles',
      'pricing_rules',
      'deliveries',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" ADD CONSTRAINT "chk_${table}_usd" CHECK ("currency" = 'USD')`,
      );
    }
    await queryRunner.query(`
      CREATE TABLE "driver_compensation_plans" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "name" varchar(255) NOT NULL,
        "type" varchar(20) NOT NULL CHECK ("type" IN ('PER_DELIVERY','DAILY','MONTHLY','HYBRID')),
        "active" boolean NOT NULL DEFAULT true,
        "components" jsonb NOT NULL,
        "effectiveFrom" timestamptz NOT NULL DEFAULT now(),
        "effectiveTo" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_driver_compensation_plans_interval" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_driver_compensation_plans_active" ON "driver_compensation_plans" ("active", "createdAt" DESC, "id" DESC)`,
    );
    await queryRunner.query(`
      CREATE TABLE "driver_plan_assignments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "driverId" uuid NOT NULL REFERENCES "driver_profiles"("id") ON DELETE RESTRICT,
        "planId" uuid NOT NULL REFERENCES "driver_compensation_plans"("id") ON DELETE RESTRICT,
        "effectiveFrom" timestamptz NOT NULL,
        "effectiveTo" timestamptz,
        "createdById" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "chk_driver_plan_assignments_interval" CHECK ("effectiveTo" IS NULL OR "effectiveTo" > "effectiveFrom"),
        CONSTRAINT "ex_driver_plan_assignments_overlap" EXCLUDE USING gist (
          "driverId" WITH =, tstzrange("effectiveFrom", "effectiveTo", '[)') WITH &&
        )
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "idx_driver_plan_assignments_driver_effective" ON "driver_plan_assignments" ("driverId", "effectiveFrom" DESC, "id" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_driver_plan_assignments_plan_end" ON "driver_plan_assignments" ("planId", "effectiveTo")`,
    );
    await queryRunner.query(`
      CREATE FUNCTION protect_driver_plan_terms() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Plan history is immutable'; END IF;
        IF (NEW."id", NEW."name", NEW."type", NEW."components", NEW."effectiveFrom", NEW."createdAt")
          IS DISTINCT FROM (OLD."id", OLD."name", OLD."type", OLD."components", OLD."effectiveFrom", OLD."createdAt")
          THEN RAISE EXCEPTION 'Plan terms are immutable'; END IF;
        IF OLD."effectiveTo" IS NOT NULL AND NEW."effectiveTo" IS DISTINCT FROM OLD."effectiveTo"
          THEN RAISE EXCEPTION 'Plan end is immutable once set'; END IF;
        IF OLD."active" = false AND NEW."active" = true THEN RAISE EXCEPTION 'Superseded plan cannot be reactivated'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(
      `CREATE TRIGGER "trg_protect_driver_plan_terms" BEFORE UPDATE OR DELETE ON "driver_compensation_plans" FOR EACH ROW EXECUTE FUNCTION protect_driver_plan_terms()`,
    );
    await queryRunner.query(`
      CREATE FUNCTION protect_driver_plan_assignment() RETURNS trigger AS $$
      BEGIN
        IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Assignment history is immutable'; END IF;
        IF (NEW."id", NEW."driverId", NEW."planId", NEW."effectiveFrom", NEW."createdById", NEW."createdAt")
          IS DISTINCT FROM (OLD."id", OLD."driverId", OLD."planId", OLD."effectiveFrom", OLD."createdById", OLD."createdAt")
          THEN RAISE EXCEPTION 'Assignment terms are immutable'; END IF;
        IF OLD."effectiveTo" IS NOT NULL AND NEW."effectiveTo" IS DISTINCT FROM OLD."effectiveTo"
          THEN RAISE EXCEPTION 'Assignment end is immutable once set'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(
      `CREATE TRIGGER "trg_protect_driver_plan_assignment" BEFORE UPDATE OR DELETE ON "driver_plan_assignments" FOR EACH ROW EXECUTE FUNCTION protect_driver_plan_assignment()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "driver_plan_assignments"`);
    await queryRunner.query(`DROP FUNCTION protect_driver_plan_assignment()`);
    await queryRunner.query(`DROP TABLE "driver_compensation_plans"`);
    await queryRunner.query(`DROP FUNCTION protect_driver_plan_terms()`);
    for (const table of [
      'businesses',
      'driver_profiles',
      'pricing_rules',
      'deliveries',
    ]) {
      await queryRunner.query(
        `ALTER TABLE "${table}" DROP CONSTRAINT "chk_${table}_usd"`,
      );
    }
  }
}
