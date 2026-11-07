import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImmutableLedger1700000000014 implements MigrationInterface {
  name = 'AddImmutableLedger1700000000014';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE ledger_events (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        kind varchar(20) NOT NULL CHECK (kind IN ('priced','collection','charge','reversal','reassignment','adjustment','settlement','refund')),
        "sourceId" uuid NOT NULL,
        "payloadHash" varchar(64) NOT NULL CHECK ("payloadHash" ~ '^[0-9a-f]{64}$'),
        "entryCount" smallint NOT NULL CHECK ("entryCount" BETWEEN 0 AND 20),
        "createdById" uuid REFERENCES users(id) ON DELETE RESTRICT,
        "occurredAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_ledger_event_source UNIQUE (kind, "sourceId")
      );
      CREATE TABLE ledger_entries (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "eventId" uuid NOT NULL REFERENCES ledger_events(id) ON DELETE RESTRICT,
        "eventIndex" smallint NOT NULL CHECK ("eventIndex" BETWEEN 0 AND 19),
        "entryType" varchar(40) NOT NULL CHECK ("entryType" IN (
          'COD_COLLECTED','COD_PAYABLE','DELIVERY_FEE_CHARGED','DRIVER_EARNING',
          'PLATFORM_DELIVERY_REVENUE','DRIVER_DAILY_CHARGE','DRIVER_MONTHLY_CHARGE',
          'SETTLEMENT','REFUND','ADJUSTMENT','REVERSAL')),
        amount bigint NOT NULL CHECK (amount > 0),
        currency varchar(3) NOT NULL CHECK (currency = 'USD'),
        "beneficiaryType" varchar(10) NOT NULL,
        "beneficiaryUserId" uuid REFERENCES users(id) ON DELETE RESTRICT,
        "beneficiaryBusinessId" uuid REFERENCES businesses(id) ON DELETE RESTRICT,
        "deliveryId" uuid REFERENCES deliveries(id) ON DELETE RESTRICT,
        "driverId" uuid REFERENCES driver_profiles(id) ON DELETE RESTRICT,
        "periodStart" date,
        "reversesEntryId" uuid REFERENCES ledger_entries(id) ON DELETE RESTRICT,
        "replacesEntryId" uuid REFERENCES ledger_entries(id) ON DELETE RESTRICT,
        "adjustsEntryId" uuid REFERENCES ledger_entries(id) ON DELETE RESTRICT,
        "referenceType" varchar(20) NOT NULL,
        "referenceId" uuid NOT NULL,
        description text CHECK (length(description) <= 2000),
        "createdById" uuid REFERENCES users(id) ON DELETE RESTRICT,
        "occurredAt" timestamptz NOT NULL,
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_ledger_event_index UNIQUE ("eventId", "eventIndex"),
        CONSTRAINT chk_ledger_beneficiary CHECK (
          ("beneficiaryType" = 'user' AND "beneficiaryUserId" IS NOT NULL AND "beneficiaryBusinessId" IS NULL) OR
          ("beneficiaryType" = 'business' AND "beneficiaryUserId" IS NULL AND "beneficiaryBusinessId" IS NOT NULL) OR
          ("beneficiaryType" = 'platform' AND "beneficiaryUserId" IS NULL AND "beneficiaryBusinessId" IS NULL)),
        CONSTRAINT chk_ledger_correction CHECK (
          ("entryType" = 'REVERSAL') = ("reversesEntryId" IS NOT NULL) AND
          ("entryType" = 'ADJUSTMENT') = ("adjustsEntryId" IS NOT NULL) AND
          ("replacesEntryId" IS NULL OR "entryType" = 'DRIVER_EARNING') AND
          ("entryType" NOT IN ('ADJUSTMENT','REVERSAL') OR length(trim(description)) > 0 AND description IS NOT NULL)),
        CONSTRAINT chk_ledger_scope CHECK (
          ("entryType" NOT IN ('COD_COLLECTED','COD_PAYABLE','DELIVERY_FEE_CHARGED','DRIVER_EARNING','PLATFORM_DELIVERY_REVENUE') OR "deliveryId" IS NOT NULL) AND
          ("entryType" NOT IN ('COD_COLLECTED','DRIVER_EARNING','DRIVER_DAILY_CHARGE','DRIVER_MONTHLY_CHARGE') OR "driverId" IS NOT NULL) AND
          ("entryType" NOT IN ('COD_PAYABLE','DELIVERY_FEE_CHARGED','PLATFORM_DELIVERY_REVENUE') OR "driverId" IS NULL) AND
          ("entryType" NOT IN ('DRIVER_DAILY_CHARGE','DRIVER_MONTHLY_CHARGE','SETTLEMENT') OR "deliveryId" IS NULL) AND
          ("entryType" NOT IN ('COD_COLLECTED','PLATFORM_DELIVERY_REVENUE','DRIVER_DAILY_CHARGE','DRIVER_MONTHLY_CHARGE') OR "beneficiaryType" = 'platform') AND
          ("entryType" NOT IN ('COD_PAYABLE','DELIVERY_FEE_CHARGED','SETTLEMENT','REFUND') OR "beneficiaryType" IN ('user','business')) AND
          ("entryType" <> 'DRIVER_EARNING' OR "beneficiaryType" = 'user')),
        CONSTRAINT chk_ledger_period CHECK (
          ("entryType" IN ('DRIVER_DAILY_CHARGE','DRIVER_MONTHLY_CHARGE') AND "periodStart" IS NOT NULL) OR
          "entryType" = 'REVERSAL' OR
          ("entryType" NOT IN ('DRIVER_DAILY_CHARGE','DRIVER_MONTHLY_CHARGE') AND "periodStart" IS NULL))
      );
      CREATE UNIQUE INDEX uq_ledger_delivery_source ON ledger_entries ("deliveryId", "entryType")
        WHERE "entryType" IN ('COD_COLLECTED','COD_PAYABLE','DELIVERY_FEE_CHARGED','PLATFORM_DELIVERY_REVENUE')
          OR ("entryType" = 'DRIVER_EARNING' AND "replacesEntryId" IS NULL);
      CREATE UNIQUE INDEX uq_ledger_charge_period ON ledger_entries ("driverId", "entryType", "periodStart")
        WHERE "entryType" IN ('DRIVER_DAILY_CHARGE','DRIVER_MONTHLY_CHARGE');
      CREATE UNIQUE INDEX uq_ledger_charge_source ON ledger_entries ("referenceId")
        WHERE "entryType" IN ('DRIVER_DAILY_CHARGE','DRIVER_MONTHLY_CHARGE');
      CREATE UNIQUE INDEX uq_ledger_reversal ON ledger_entries ("reversesEntryId") WHERE "reversesEntryId" IS NOT NULL;
      CREATE UNIQUE INDEX uq_ledger_replacement ON ledger_entries ("replacesEntryId") WHERE "replacesEntryId" IS NOT NULL;
      CREATE UNIQUE INDEX uq_ledger_settlement_source ON ledger_entries ("referenceId") WHERE "entryType" = 'SETTLEMENT';
      CREATE INDEX idx_ledger_delivery ON ledger_entries ("deliveryId", "occurredAt", id) WHERE "deliveryId" IS NOT NULL;
      CREATE INDEX idx_ledger_driver ON ledger_entries ("driverId", "occurredAt", id) WHERE "driverId" IS NOT NULL;
      CREATE INDEX idx_ledger_user ON ledger_entries ("beneficiaryUserId", "occurredAt", id) WHERE "beneficiaryUserId" IS NOT NULL;
      CREATE INDEX idx_ledger_business ON ledger_entries ("beneficiaryBusinessId", "occurredAt", id) WHERE "beneficiaryBusinessId" IS NOT NULL;
      CREATE INDEX idx_ledger_adjustment_target ON ledger_entries ("adjustsEntryId") WHERE "adjustsEntryId" IS NOT NULL;
    `);
    await q.query(`
      CREATE FUNCTION protect_ledger_history() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'Ledger history is immutable'; END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_ledger_entries_immutable BEFORE UPDATE OR DELETE ON ledger_entries
        FOR EACH ROW EXECUTE FUNCTION protect_ledger_history();
      CREATE TRIGGER trg_ledger_events_immutable BEFORE UPDATE OR DELETE ON ledger_events
        FOR EACH ROW EXECUTE FUNCTION protect_ledger_history();
      CREATE TRIGGER trg_ledger_entries_no_truncate BEFORE TRUNCATE ON ledger_entries
        FOR EACH STATEMENT EXECUTE FUNCTION protect_ledger_history();
      CREATE TRIGGER trg_ledger_events_no_truncate BEFORE TRUNCATE ON ledger_events
        FOR EACH STATEMENT EXECUTE FUNCTION protect_ledger_history();
    `);
    await q.query(`
      CREATE FUNCTION validate_ledger_entry() RETURNS trigger AS $$
      DECLARE ev ledger_events%ROWTYPE; target ledger_entries%ROWTYPE; d deliveries%ROWTYPE; owner_id uuid;
      BEGIN
        SELECT * INTO STRICT ev FROM ledger_events WHERE id = NEW."eventId";
        IF NEW."eventIndex" >= ev."entryCount" OR
          (NEW."createdById", NEW."occurredAt", NEW."referenceId", NEW."referenceType") IS DISTINCT FROM
          (ev."createdById", ev."occurredAt", ev."sourceId", CASE
            WHEN ev.kind IN ('priced','collection') THEN 'delivery'
            WHEN ev.kind = 'charge' THEN 'charge' WHEN ev.kind = 'settlement' THEN 'settlement' ELSE 'adjustment' END)
        THEN RAISE EXCEPTION 'Ledger event attribution or source mismatch' USING ERRCODE = '23514'; END IF;
        IF NEW."driverId" IS NOT NULL AND NEW."beneficiaryType" = 'user' THEN
          SELECT "userId" INTO owner_id FROM driver_profiles WHERE id = NEW."driverId";
          IF NEW."beneficiaryUserId" IS DISTINCT FROM owner_id THEN
            RAISE EXCEPTION 'Driver beneficiary mismatch' USING ERRCODE = '23514'; END IF;
        END IF;
        IF NEW."driverId" IS NOT NULL AND NEW."beneficiaryType" = 'business' THEN
          RAISE EXCEPTION 'Driver balance cannot name a business beneficiary' USING ERRCODE = '23514'; END IF;
        IF ev.kind IN ('priced','collection') THEN
          SELECT * INTO STRICT d FROM deliveries WHERE id = ev."sourceId";
          IF NEW."deliveryId" IS DISTINCT FROM d.id OR NEW.currency <> d.currency THEN
            RAISE EXCEPTION 'Delivery source mismatch' USING ERRCODE = '23514'; END IF;
          IF NEW."entryType" IN ('COD_PAYABLE','DELIVERY_FEE_CHARGED') AND
            ((d."businessId" IS NULL AND (NEW."beneficiaryType" <> 'user' OR NEW."beneficiaryUserId" IS DISTINCT FROM d."createdByUserId")) OR
             (d."businessId" IS NOT NULL AND (NEW."beneficiaryType" <> 'business' OR NEW."beneficiaryBusinessId" IS DISTINCT FROM d."businessId")))
          THEN RAISE EXCEPTION 'Sender beneficiary mismatch' USING ERRCODE = '23514'; END IF;
        END IF;
        IF NEW."reversesEntryId" IS NOT NULL THEN
          SELECT * INTO STRICT target FROM ledger_entries WHERE id = NEW."reversesEntryId" FOR UPDATE;
          IF target."entryType" NOT IN ('COD_PAYABLE','DELIVERY_FEE_CHARGED','DRIVER_EARNING','PLATFORM_DELIVERY_REVENUE','DRIVER_DAILY_CHARGE','DRIVER_MONTHLY_CHARGE') OR
             (NEW.amount, NEW.currency, NEW."deliveryId", NEW."driverId", NEW."beneficiaryType", NEW."beneficiaryUserId", NEW."beneficiaryBusinessId", NEW."periodStart") IS DISTINCT FROM
             (target.amount, target.currency, target."deliveryId", target."driverId", target."beneficiaryType", target."beneficiaryUserId", target."beneficiaryBusinessId", target."periodStart")
          THEN RAISE EXCEPTION 'Invalid reversal target or terms' USING ERRCODE = '23514'; END IF;
        END IF;
        IF NEW."replacesEntryId" IS NOT NULL THEN
          SELECT * INTO STRICT target FROM ledger_entries WHERE id = NEW."replacesEntryId" FOR UPDATE;
          IF target."entryType" <> 'DRIVER_EARNING' OR
             (NEW.amount, NEW.currency, NEW."deliveryId") IS DISTINCT FROM (target.amount, target.currency, target."deliveryId")
          THEN RAISE EXCEPTION 'Replacement must retain original earning terms' USING ERRCODE = '23514'; END IF;
        END IF;
        IF NEW."adjustsEntryId" IS NOT NULL THEN
          SELECT * INTO STRICT target FROM ledger_entries WHERE id = NEW."adjustsEntryId";
          IF NEW.currency <> target.currency OR NEW."driverId" IS DISTINCT FROM target."driverId" OR
             NEW."deliveryId" IS DISTINCT FROM target."deliveryId" OR
             target."entryType" NOT IN ('COD_COLLECTED','COD_PAYABLE','DELIVERY_FEE_CHARGED','DRIVER_EARNING','DRIVER_DAILY_CHARGE','DRIVER_MONTHLY_CHARGE') OR
             (NEW."driverId" IS NULL AND (target."entryType" NOT IN ('COD_PAYABLE','DELIVERY_FEE_CHARGED') OR
               (NEW."beneficiaryType" <> 'platform' AND
                (NEW."beneficiaryType", NEW."beneficiaryUserId", NEW."beneficiaryBusinessId") IS DISTINCT FROM
                (target."beneficiaryType", target."beneficiaryUserId", target."beneficiaryBusinessId"))))
          THEN RAISE EXCEPTION 'Adjustment scope mismatch' USING ERRCODE = '23514'; END IF;
        END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER trg_validate_ledger_entry BEFORE INSERT ON ledger_entries FOR EACH ROW EXECUTE FUNCTION validate_ledger_entry();
    `);
    await q.query(`
      CREATE FUNCTION validate_ledger_event_complete() RETURNS trigger AS $$
      DECLARE ev ledger_events%ROWTYPE; n int; valid boolean; fee bigint;
      BEGIN
        IF TG_TABLE_NAME = 'ledger_events' THEN ev := NEW;
        ELSE SELECT * INTO STRICT ev FROM ledger_events WHERE id = NEW."eventId"; END IF;
        SELECT count(*) INTO n FROM ledger_entries WHERE "eventId" = ev.id;
        IF n <> ev."entryCount" THEN RAISE EXCEPTION 'Incomplete ledger event' USING ERRCODE = '23514'; END IF;
        IF ev.kind IN ('priced','collection') THEN
          SELECT "deliveryFee" INTO STRICT fee FROM deliveries WHERE id = ev."sourceId";
          IF ev.kind = 'priced' AND fee <> (SELECT coalesce(sum(amount),0) FROM ledger_entries WHERE "eventId" = ev.id AND "entryType" = 'DELIVERY_FEE_CHARGED') THEN
            RAISE EXCEPTION 'PRICED fee does not match delivery' USING ERRCODE = '23514'; END IF;
        END IF;
        SELECT CASE ev.kind
          WHEN 'priced' THEN n <= 3 AND
            coalesce(bool_and("entryType" IN ('DELIVERY_FEE_CHARGED','DRIVER_EARNING','PLATFORM_DELIVERY_REVENUE') AND "replacesEntryId" IS NULL), true) AND
            coalesce(sum(amount) FILTER (WHERE "entryType" = 'DELIVERY_FEE_CHARGED'),0) =
            coalesce(sum(amount) FILTER (WHERE "entryType" IN ('DRIVER_EARNING','PLATFORM_DELIVERY_REVENUE')),0)
          WHEN 'collection' THEN n = 0 OR (n = 2 AND count(*) FILTER (WHERE "entryType" = 'COD_COLLECTED') = 1 AND
            count(*) FILTER (WHERE "entryType" = 'COD_PAYABLE') = 1 AND min(amount) = max(amount))
          WHEN 'charge' THEN n = 1 AND bool_and("entryType" IN ('DRIVER_DAILY_CHARGE','DRIVER_MONTHLY_CHARGE'))
          WHEN 'reversal' THEN n = 1 AND bool_and("entryType" = 'REVERSAL' AND "reversesEntryId" = ev."sourceId")
          WHEN 'reassignment' THEN n = 2 AND
            count(*) FILTER (WHERE "entryType" = 'REVERSAL' AND "reversesEntryId" = ev."sourceId") = 1 AND
            count(*) FILTER (WHERE "entryType" = 'DRIVER_EARNING' AND "replacesEntryId" = ev."sourceId") = 1
          WHEN 'adjustment' THEN n = 1 AND bool_and("entryType" = 'ADJUSTMENT') AND ev."createdById" IS NOT NULL
          WHEN 'settlement' THEN n = 1 AND bool_and("entryType" = 'SETTLEMENT')
          WHEN 'refund' THEN n BETWEEN 1 AND 2 AND count(*) FILTER (WHERE "entryType" = 'REFUND') = 1 AND
            bool_and("entryType" IN ('REFUND','REVERSAL'))
          ELSE false END INTO valid FROM ledger_entries WHERE "eventId" = ev.id;
        IF valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'Invalid ledger posting group' USING ERRCODE = '23514'; END IF;
        IF ev.kind = 'refund' AND n = 2 AND NOT EXISTS (
          SELECT 1 FROM ledger_entries f JOIN ledger_entries r ON r."eventId" = f."eventId"
          WHERE f."eventId" = ev.id AND f."entryType" = 'REFUND' AND r."entryType" = 'REVERSAL'
            AND f.currency = r.currency AND f."driverId" IS NOT DISTINCT FROM r."driverId"
            AND f."deliveryId" IS NOT DISTINCT FROM r."deliveryId"
            AND ((r."beneficiaryType" = 'platform' AND r."driverId" IS NOT NULL) OR
              (f."beneficiaryType", f."beneficiaryUserId", f."beneficiaryBusinessId") IS NOT DISTINCT FROM
              (r."beneficiaryType", r."beneficiaryUserId", r."beneficiaryBusinessId"))
        ) THEN RAISE EXCEPTION 'Refund and obligation scope mismatch' USING ERRCODE = '23514'; END IF;
        RETURN NULL;
      END; $$ LANGUAGE plpgsql;
      CREATE CONSTRAINT TRIGGER trg_ledger_event_complete AFTER INSERT ON ledger_events DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION validate_ledger_event_complete();
      CREATE CONSTRAINT TRIGGER trg_ledger_entries_complete AFTER INSERT ON ledger_entries DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION validate_ledger_event_complete();
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE ledger_entries; DROP TABLE ledger_events;
      DROP FUNCTION validate_ledger_event_complete(); DROP FUNCTION validate_ledger_entry(); DROP FUNCTION protect_ledger_history();`);
  }
}
