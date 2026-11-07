import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowUnassignedEarningReplacement1700000000016 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await this.setRule(q, true);
  }
  async down(q: QueryRunner): Promise<void> {
    const rows: { exists: boolean }[] = await q.query(
      `SELECT EXISTS (SELECT 1 FROM ledger_events WHERE kind = 'reassignment' AND "entryCount" = 1)`,
    );
    if (rows[0].exists)
      throw new Error(
        'Cannot revert split reassignment history; preserve immutable records',
      );
    await this.setRule(q, false);
  }
  private async setRule(q: QueryRunner, split: boolean): Promise<void> {
    await q.query(`
      CREATE OR REPLACE FUNCTION validate_ledger_event_complete() RETURNS trigger AS $$
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
          WHEN 'reassignment' THEN (${
            split
              ? `(n = 1 AND bool_and("entryType" = 'DRIVER_EARNING' AND "replacesEntryId" = ev."sourceId") AND
            EXISTS (SELECT 1 FROM ledger_entries r WHERE r."reversesEntryId" = ev."sourceId")) OR`
              : ''
          }
            (n = 2 AND count(*) FILTER (WHERE "entryType" = 'REVERSAL' AND "reversesEntryId" = ev."sourceId") = 1 AND
            count(*) FILTER (WHERE "entryType" = 'DRIVER_EARNING' AND "replacesEntryId" = ev."sourceId") = 1))
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
    `);
  }
}
