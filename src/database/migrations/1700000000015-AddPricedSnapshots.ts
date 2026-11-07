import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPricedSnapshots1700000000015 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE delivery_financial_snapshots (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "deliveryId" uuid NOT NULL UNIQUE REFERENCES deliveries(id) ON DELETE RESTRICT,
        currency varchar(3) NOT NULL CHECK (currency = 'USD'),
        "customerDeliveryFee" bigint NOT NULL CHECK ("customerDeliveryFee" >= 0),
        "eligibleFeeComponents" jsonb NOT NULL,
        "driverEarnings" bigint NOT NULL CHECK ("driverEarnings" >= 0),
        "platformDeliveryRevenue" bigint NOT NULL CHECK ("platformDeliveryRevenue" >= 0),
        "pricingRuleId" uuid REFERENCES pricing_rules(id) ON DELETE SET NULL,
        "driverCompensationPlanId" uuid REFERENCES driver_compensation_plans(id) ON DELETE SET NULL,
        "driverPlanAssignmentId" uuid REFERENCES driver_plan_assignments(id) ON DELETE SET NULL,
        "lockedAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now(),
        CHECK ("customerDeliveryFee"::numeric = "driverEarnings"::numeric + "platformDeliveryRevenue"::numeric)
      );
      CREATE UNIQUE INDEX uq_driver_active_delivery ON deliveries ("driverId")
        WHERE "driverId" IS NOT NULL AND status IN ('ASSIGNED','ACCEPTED','PICKED_UP','IN_TRANSIT','ARRIVED','FAILED','RESCHEDULED');
      CREATE FUNCTION protect_financial_snapshot() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'Financial snapshot is immutable'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_financial_snapshot_immutable BEFORE UPDATE OR DELETE ON delivery_financial_snapshots
        FOR EACH ROW EXECUTE FUNCTION protect_financial_snapshot();
      CREATE TRIGGER trg_financial_snapshot_no_truncate BEFORE TRUNCATE ON delivery_financial_snapshots
        FOR EACH STATEMENT EXECUTE FUNCTION protect_financial_snapshot();
      CREATE FUNCTION validate_financial_snapshot() RETURNS trigger AS $$
      DECLARE d deliveries%ROWTYPE; a driver_plan_assignments%ROWTYPE; p driver_compensation_plans%ROWTYPE;
      BEGIN
        SELECT * INTO STRICT d FROM deliveries WHERE id = NEW."deliveryId";
        SELECT * INTO STRICT a FROM driver_plan_assignments WHERE id = NEW."driverPlanAssignmentId";
        SELECT * INTO STRICT p FROM driver_compensation_plans WHERE id = NEW."driverCompensationPlanId";
        IF d."driverId" IS NULL OR a."driverId" <> d."driverId" OR a."planId" <> p.id OR NOT p.active OR
           NOT (tstzrange(a."effectiveFrom", a."effectiveTo", '[)') @> NEW."lockedAt") OR
           NOT (tstzrange(p."effectiveFrom", p."effectiveTo", '[)') @> NEW."lockedAt") OR
           NEW.currency <> d.currency OR NEW."customerDeliveryFee" <> d."deliveryFee" OR
           NEW."pricingRuleId" IS DISTINCT FROM d."pricingRuleId" OR d."feeBreakdown" IS NULL OR
           NEW."eligibleFeeComponents" IS DISTINCT FROM (d."feeBreakdown" || jsonb_build_object('totalEligibleFee', d."deliveryFee"::text, 'paymentMethod', d."paymentMethod"))
        THEN RAISE EXCEPTION 'Invalid snapshot source, terms or effective interval' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_validate_financial_snapshot BEFORE INSERT ON delivery_financial_snapshots
        FOR EACH ROW EXECUTE FUNCTION validate_financial_snapshot();
      CREATE FUNCTION validate_snapshot_postings() RETURNS trigger AS $$
      DECLARE ev uuid; earning bigint; revenue bigint; fee bigint; entitlement_driver uuid; assigned_driver uuid;
      BEGIN
        SELECT id INTO ev FROM ledger_events WHERE kind = 'priced' AND "sourceId" = NEW."deliveryId";
        SELECT coalesce(sum(amount) FILTER (WHERE "entryType" = 'DRIVER_EARNING'),0),
               coalesce(sum(amount) FILTER (WHERE "entryType" = 'PLATFORM_DELIVERY_REVENUE'),0),
               coalesce(sum(amount) FILTER (WHERE "entryType" = 'DELIVERY_FEE_CHARGED'),0)
          INTO earning, revenue, fee FROM ledger_entries WHERE "eventId" = ev;
        SELECT "driverId" INTO entitlement_driver FROM ledger_entries WHERE "eventId" = ev AND "entryType" = 'DRIVER_EARNING';
        SELECT "driverId" INTO assigned_driver FROM driver_plan_assignments WHERE id = NEW."driverPlanAssignmentId";
        IF ev IS NULL OR (earning, revenue, fee) IS DISTINCT FROM
           (NEW."driverEarnings", NEW."platformDeliveryRevenue", NEW."customerDeliveryFee") OR
           (earning > 0 AND entitlement_driver IS DISTINCT FROM assigned_driver)
        THEN RAISE EXCEPTION 'Snapshot and PRICED postings must commit together' USING ERRCODE = '23514'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE CONSTRAINT TRIGGER trg_snapshot_postings AFTER INSERT ON delivery_financial_snapshots
        DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION validate_snapshot_postings();
      CREATE FUNCTION protect_committed_delivery_terms() RETURNS trigger AS $$
      BEGIN
        IF EXISTS (SELECT 1 FROM delivery_financial_snapshots WHERE "deliveryId" = OLD.id) AND
           (NEW."createdByUserId", NEW."businessId", NEW.currency, NEW."deliveryFee", NEW."codAmount", NEW."paymentMethod", NEW."pricingRuleId", NEW."feeBreakdown")
             IS DISTINCT FROM
           (OLD."createdByUserId", OLD."businessId", OLD.currency, OLD."deliveryFee", OLD."codAmount", OLD."paymentMethod", OLD."pricingRuleId", OLD."feeBreakdown")
        THEN RAISE EXCEPTION 'Committed delivery terms are immutable'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_committed_delivery_terms BEFORE UPDATE ON deliveries
        FOR EACH ROW EXECUTE FUNCTION protect_committed_delivery_terms();
    `);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`
      DROP TRIGGER trg_committed_delivery_terms ON deliveries;
      DROP FUNCTION protect_committed_delivery_terms();
      DROP TABLE delivery_financial_snapshots;
      DROP FUNCTION validate_snapshot_postings();
      DROP FUNCTION validate_financial_snapshot();
      DROP FUNCTION protect_financial_snapshot();
      DROP INDEX uq_driver_active_delivery;
    `);
  }
}
