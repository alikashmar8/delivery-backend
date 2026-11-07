import { DeliveryFinancialSnapshot } from '../src/modules/finance/entities/delivery-financial-snapshot.entity';
import { LedgerEntry } from '../src/modules/finance/entities/ledger-entry.entity';
import { LedgerEvent } from '../src/modules/finance/entities/ledger-event.entity';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ZonesService } from '../src/modules/zones/zones.service';
import { InitExtensionsAndEnums1700000000000 } from '../src/database/migrations/1700000000000-InitExtensionsAndEnums';
import { CreateIdentityTables1700000000001 } from '../src/database/migrations/1700000000001-CreateIdentityTables';
import { CreateBusinessTables1700000000002 } from '../src/database/migrations/1700000000002-CreateBusinessTables';
import { CreateGeoPricingTables1700000000003 } from '../src/database/migrations/1700000000003-CreateGeoPricingTables';
import { SeedLebanonRegions1700000000004 } from '../src/database/migrations/1700000000004-SeedLebanonRegions';
import { CreateDeliveryCore1700000000005 } from '../src/database/migrations/1700000000005-CreateDeliveryCore';
import { StabilizePhasesZeroToFour1700000000006 } from '../src/database/migrations/1700000000006-StabilizePhasesZeroToFour';
import { UseCamelCaseColumns1700000000007 } from '../src/database/migrations/1700000000007-UseCamelCaseColumns';
import { CreateIdempotencyTable1700000000008 } from '../src/database/migrations/1700000000008-CreateIdempotencyTable';
import { CreateAuditTable1700000000009 } from '../src/database/migrations/1700000000009-CreateAuditTable';
import { AddDeliveryPricingProvenance1700000000010 } from '../src/database/migrations/1700000000010-AddDeliveryPricingProvenance';
import { Address } from '../src/modules/addresses/entities/address.entity';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { BusinessMember } from '../src/modules/businesses/entities/business-member.entity';
import { Business } from '../src/modules/businesses/entities/business.entity';
import { DeliveryAddress } from '../src/modules/deliveries/entities/delivery-address.entity';
import { DeliveryStatusHistory } from '../src/modules/deliveries/entities/delivery-status-history.entity';
import { Delivery } from '../src/modules/deliveries/entities/delivery.entity';
import { IdempotencyKey } from '../src/modules/idempotency/entities/idempotency-key.entity';
import { Recipient } from '../src/modules/deliveries/entities/recipient.entity';
import { PricingRule } from '../src/modules/pricing/entities/pricing-rule.entity';
import { Region } from '../src/modules/regions/entities/region.entity';
import { AdminRoleAssignment } from '../src/modules/users/entities/admin-role-assignment.entity';
import { DriverCompensationPlan } from '../src/modules/finance/entities/driver-compensation-plan.entity';
import { DriverPlanAssignment } from '../src/modules/finance/entities/driver-plan-assignment.entity';
import { DriverProfile } from '../src/modules/users/entities/driver-profile.entity';
import { RefreshToken } from '../src/modules/users/entities/refresh-token.entity';
import { User } from '../src/modules/users/entities/user.entity';
import { DeliveryZone } from '../src/modules/zones/entities/delivery-zone.entity';
import { createPostgisDatabase } from './helpers/postgis-database';

const entities = [
  User,
  DriverProfile,
  DriverCompensationPlan,
  DriverPlanAssignment,
  LedgerEntry,
  LedgerEvent,
  DeliveryFinancialSnapshot,
  AdminRoleAssignment,
  RefreshToken,
  Business,
  BusinessMember,
  Address,
  Region,
  DeliveryZone,
  PricingRule,
  Delivery,
  Recipient,
  DeliveryAddress,
  DeliveryStatusHistory,
  IdempotencyKey,
  AuditLog,
];

const migrations = [
  InitExtensionsAndEnums1700000000000,
  CreateIdentityTables1700000000001,
  CreateBusinessTables1700000000002,
  CreateGeoPricingTables1700000000003,
  SeedLebanonRegions1700000000004,
  CreateDeliveryCore1700000000005,
  StabilizePhasesZeroToFour1700000000006,
  UseCamelCaseColumns1700000000007,
  CreateIdempotencyTable1700000000008,
  CreateAuditTable1700000000009,
  AddDeliveryPricingProvenance1700000000010,
];

// This fixture stops at the state immediately after the 0007 rename so it can
// exercise 0007 up/down/up against populated legacy columns. C04's version
// column is intentionally absent: migration 0012 depends on the renamed
// camelCase columns and therefore cannot be applied before this test's first
// 0007 up.
const propertiesAddedAfterCamelCaseRename: Record<string, string[]> = {
  driver_profiles: ['version'],
};

describe('CamelCase column migration on populated legacy tables', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;

  beforeAll(async () => {
    // Legacy setup: every migration except the rename itself. Later
    // additive migrations (0008+) are camelCase-native and unaffected.
    database = await createPostgisDatabase(
      entities,
      migrations.filter((m) => m !== UseCamelCaseColumns1700000000007),
    );
  });

  afterAll(async () => {
    if (database) await database.close();
  });

  async function snapshotRows() {
    const source = database.dataSource;
    const snapshot: Record<string, unknown[]> = {};
    for (const metadata of source.entityMetadatas) {
      if (
        metadata.tableName === 'delivery_financial_snapshots' ||
        metadata.tableName === 'ledger_entries' ||
        metadata.tableName === 'ledger_events' ||
        metadata.tableName === 'driver_compensation_plans' ||
        metadata.tableName === 'driver_plan_assignments'
      )
        continue;
      const rows: Record<string, unknown>[] = await source.query(
        `SELECT * FROM "${metadata.tableName}" ORDER BY id LIMIT 1000`,
      );
      const [{ count }]: { count: string }[] = await source.query(
        `SELECT count(*)::text AS count FROM "${metadata.tableName}"`,
      );
      expect(rows).toHaveLength(Number(count));
      snapshot[metadata.tableName] = rows.map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [
            key.replace(/_([a-z])/g, (_, letter: string) =>
              letter.toUpperCase(),
            ),
            value,
          ]),
        ),
      );
    }
    return snapshot;
  }

  async function schemaObjects() {
    const source = database.dataSource;
    return {
      constraints: await source.query(
        `SELECT oid, conname, conrelid, contype, conkey, confkey, confdeltype, convalidated FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY oid`,
      ),
      indexes: await source.query(
        `SELECT indexrelid, indrelid, indkey, indisunique, indisvalid FROM pg_index WHERE indrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) ORDER BY indexrelid`,
      ),
      triggers: await source.query(
        `SELECT oid, tgrelid, tgname, tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (SELECT oid FROM pg_class WHERE relnamespace='public'::regnamespace) ORDER BY oid`,
      ),
    };
  }

  it('upgrades, reverses and reapplies without changing rows, FKs, indexes or immutability', async () => {
    const source = database.dataSource;
    // These statements deliberately describe the old schema, before the rename.
    const [user]: { id: string }[] = await source.query(
      `INSERT INTO users (phone, display_name, password_hash) VALUES ('+96179992001', 'Legacy sender', 'synthetic hash') RETURNING id`,
    );
    const [business]: { id: string }[] = await source.query(
      `INSERT INTO businesses (name, slug, contact_phone, settlement_config) VALUES ('Legacy business', 'legacy-camelcase', '+96179992001', '{"schedule":"weekly"}') RETURNING id`,
    );
    await source.query(
      `INSERT INTO business_members (business_id, user_id) VALUES ($1, $2)`,
      [business.id, user.id],
    );
    const [delivery]: { id: string }[] = await source.query(
      `INSERT INTO deliveries (tracking_code, secure_tracking_token, created_by_user_id, business_id) VALUES ('legacy-case', 'legacy-synthetic-token', $1, $2) RETURNING id`,
      [user.id, business.id],
    );
    await source.query(
      `INSERT INTO recipients (delivery_id, name, phone, city, latitude, longitude) VALUES ($1, 'Legacy recipient', '+96179992002', 'Beirut', 33.9, 35.5)`,
      [delivery.id],
    );
    await source.query(
      `INSERT INTO delivery_addresses (delivery_id, city, latitude, longitude) VALUES ($1, 'Beirut', 33.9, 35.5)`,
      [delivery.id],
    );
    await source.query(
      `INSERT INTO delivery_status_history (delivery_id, to_status, actor_type, actor_id) VALUES ($1, 'CREATED', 'user', $2)`,
      [delivery.id, user.id],
    );
    const before = await snapshotRows();
    const objects = await schemaObjects();
    const originalColumns = await source.query(
      `SELECT table_name, column_name, ordinal_position FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
    );

    const migration = new UseCamelCaseColumns1700000000007();
    await source.transaction(async (manager) => {
      await migration.up(manager.queryRunner!);
    });
    expect(await snapshotRows()).toEqual(before);
    expect(await schemaObjects()).toEqual(objects);
    for (const metadata of source.entityMetadatas) {
      if (
        metadata.tableName === 'delivery_financial_snapshots' ||
        metadata.tableName === 'ledger_entries' ||
        metadata.tableName === 'ledger_events' ||
        metadata.tableName === 'driver_compensation_plans' ||
        metadata.tableName === 'driver_plan_assignments'
      )
        continue;
      const columns: { column_name: string }[] = await source.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY column_name`,
        [metadata.tableName],
      );
      expect(columns.map((column) => column.column_name)).toEqual(
        metadata.columns
          .map((column) => column.propertyName)
          .filter(
            (property) =>
              !propertiesAddedAfterCamelCaseRename[
                metadata.tableName
              ]?.includes(property),
          )
          .sort(),
      );
    }
    const loaded = await source.getRepository(Delivery).findOneOrFail({
      where: { id: delivery.id },
      relations: {
        createdByUser: true,
        business: { members: true },
        recipient: true,
        pickupAddress: true,
        statusHistory: true,
      },
    });
    expect(loaded.createdByUser?.displayName).toBe('Legacy sender');
    expect(loaded.business?.settlementConfig).toEqual({ schedule: 'weekly' });
    expect(loaded.business?.members?.[0].userId).toBe(user.id);
    expect(loaded.recipient?.name).toBe('Legacy recipient');
    expect(loaded.pickupAddress?.city).toBe('Beirut');
    expect(loaded.statusHistory).toHaveLength(1);
    await expect(
      source
        .getRepository(Recipient)
        .update({ deliveryId: delivery.id }, { name: 'Changed' }),
    ).rejects.toMatchObject({ code: 'P0001' });

    await source.transaction(async (manager) => {
      await migration.down(manager.queryRunner!);
    });
    expect(await snapshotRows()).toEqual(before);
    expect(await schemaObjects()).toEqual(objects);
    expect(
      await source.query(
        `SELECT table_name, column_name, ordinal_position FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position`,
      ),
    ).toEqual(originalColumns);
    await source.transaction(async (manager) => {
      await migration.up(manager.queryRunner!);
    });
    expect(await snapshotRows()).toEqual(before);
  });

  it('runs scoped PostGIS zone lookup with quoted camelCase columns and deterministic precedence', async () => {
    const source = database.dataSource;
    const business = await source
      .getRepository(Business)
      .findOneByOrFail({ slug: 'legacy-camelcase' });
    const boundary = {
      type: 'Polygon',
      coordinates: [
        [
          [35, 33],
          [36, 33],
          [36, 34],
          [35, 33],
        ],
      ],
    };
    await source
      .getRepository(DeliveryZone)
      .save({ name: 'Global zone', boundary });
    const scoped = await source
      .getRepository(DeliveryZone)
      .save({ name: 'Business zone', businessId: business.id, boundary });
    const otherBusiness = await source.getRepository(Business).save({
      name: 'Other business',
      slug: 'other-camelcase',
      contactPhone: '+96179992003',
    });
    const otherZone = await source
      .getRepository(DeliveryZone)
      .save({ name: 'Other scope', businessId: otherBusiness.id, boundary });
    const laterGlobal = await source
      .getRepository(DeliveryZone)
      .save({ name: 'Later global', boundary });
    const module = await Test.createTestingModule({
      providers: [
        ZonesService,
        ...[DeliveryZone, BusinessMember, Business, AdminRoleAssignment].map(
          (entity) => ({
            provide: getRepositoryToken(entity),
            useValue: source.getRepository(entity),
          }),
        ),
      ],
    }).compile();
    try {
      const zones = module.get(ZonesService);
      expect((await zones.findZoneForPoint(35.5, 33.3, business.id))?.id).toBe(
        scoped.id,
      );
      expect(
        (await zones.findZoneForPoint(35.5, 33.3, otherBusiness.id))?.id,
      ).toBe(otherZone.id);
      expect((await zones.findZoneForPoint(35.5, 33.3, null))?.id).toBe(
        laterGlobal.id,
      );
      await source
        .getRepository(DeliveryZone)
        .update(scoped.id, { active: false });
      expect((await zones.findZoneForPoint(35.5, 33.3, business.id))?.id).toBe(
        laterGlobal.id,
      );
      expect(await zones.findZoneForPoint(10, 10, business.id)).toBeNull();
    } finally {
      await module.close();
    }
  });
});
