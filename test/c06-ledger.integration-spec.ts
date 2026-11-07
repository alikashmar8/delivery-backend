import { AllowUnassignedEarningReplacement1700000000016 } from '../src/database/migrations/1700000000016-AllowUnassignedEarningReplacement';
import { AddPricedSnapshots1700000000015 } from '../src/database/migrations/1700000000015-AddPricedSnapshots';
import { DeliveryFinancialSnapshot } from '../src/modules/finance/entities/delivery-financial-snapshot.entity';
import { randomUUID } from 'node:crypto';
import { LedgerService } from '../src/modules/finance/ledger.service';
import type {
  LedgerEntryInput,
  LedgerEventInput,
} from '../src/modules/finance/ledger-event';
import { allocateDeliveryFee } from '../src/modules/finance/plan-allocation';
import { AddImmutableLedger1700000000014 } from '../src/database/migrations/1700000000014-AddImmutableLedger';
import { LedgerEntry } from '../src/modules/finance/entities/ledger-entry.entity';
import { LedgerEvent } from '../src/modules/finance/entities/ledger-event.entity';
import { hash } from 'argon2';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { appValidationPipe } from '../src/common/pipes/validation.pipe';
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
import { EnforceUniqueAdminRoleAssignments1700000000011 } from '../src/database/migrations/1700000000011-EnforceUniqueAdminRoleAssignments';
import { AddDriverCapabilityLifecycle1700000000012 } from '../src/database/migrations/1700000000012-AddDriverCapabilityLifecycle';
import { Address } from '../src/modules/addresses/entities/address.entity';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { BusinessMember } from '../src/modules/businesses/entities/business-member.entity';
import { Business } from '../src/modules/businesses/entities/business.entity';
import { DeliveryAddress } from '../src/modules/deliveries/entities/delivery-address.entity';
import { DeliveryStatusHistory } from '../src/modules/deliveries/entities/delivery-status-history.entity';
import { Delivery } from '../src/modules/deliveries/entities/delivery.entity';
import { Recipient } from '../src/modules/deliveries/entities/recipient.entity';
import { IdempotencyKey } from '../src/modules/idempotency/entities/idempotency-key.entity';
import { PricingRule } from '../src/modules/pricing/entities/pricing-rule.entity';
import { Region } from '../src/modules/regions/entities/region.entity';
import { AdminRoleAssignment } from '../src/modules/users/entities/admin-role-assignment.entity';
import { DriverProfile } from '../src/modules/users/entities/driver-profile.entity';
import { RefreshToken } from '../src/modules/users/entities/refresh-token.entity';
import { DriverCompensationPlan } from '../src/modules/finance/entities/driver-compensation-plan.entity';
import { DriverPlanAssignment } from '../src/modules/finance/entities/driver-plan-assignment.entity';
import { AddDriverCompensationPlans1700000000013 } from '../src/database/migrations/1700000000013-AddDriverCompensationPlans';
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
  EnforceUniqueAdminRoleAssignments1700000000011,
  AddDriverCapabilityLifecycle1700000000012,
  AddDriverCompensationPlans1700000000013,
  AddImmutableLedger1700000000014,
  AddPricedSnapshots1700000000015,
  AllowUnassignedEarningReplacement1700000000016,
];

describe('C06 immutable ledger against migrated PostgreSQL and AppModule', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let app: INestApplication;
  let ledger: LedgerService;
  let source: DataSource;
  let actor: User;
  let driverUser: User;
  let secondUser: User;
  let sender: User;
  let driver: DriverProfile;
  let secondDriver: DriverProfile;
  const env: Record<string, string | undefined> = {};
  const occurredAt = '2026-11-07T08:00:00.000Z';

  beforeAll(async () => {
    database = await createPostgisDatabase(entities, migrations);
    const values = {
      APP_ENV: 'test',
      OTP_STATE: 'memory',
      DB_HOST: database.connection.host,
      DB_PORT: String(database.connection.port),
      DB_NAME: database.connection.database,
      DB_USER: database.connection.username,
      DB_PASSWORD: database.connection.password,
      JWT_ACCESS_SECRET: 'c06-ledger-access-secret-value',
      JWT_REFRESH_SECRET: 'c06-ledger-refresh-secret-value',
    };
    for (const [key, value] of Object.entries(values)) {
      env[key] = process.env[key];
      process.env[key] = value;
    }
    const { AppModule } = await import('../src/app.module');
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(appValidationPipe);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    source = module.get(DataSource);
    ledger = module.get(LedgerService);
    const users = source.getRepository(User);
    const passwordHash = await hash('c06-test-password');
    [actor, sender, driverUser, secondUser] = await users.save([
      {
        phone: '+96171086001',
        displayName: 'Ledger admin',
        email: 'c06-admin@example.test',
        passwordHash,
      },
      { phone: '+96171086002', displayName: 'Sender' },
      { phone: '+96171086003', displayName: 'Driver' },
      { phone: '+96171086004', displayName: 'Second driver' },
    ]);
    [driver, secondDriver] = await source.getRepository(DriverProfile).save([
      { userId: driverUser.id, vehicleType: 'motorcycle', active: true },
      { userId: secondUser.id, vehicleType: 'motorcycle', active: true },
    ]);
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    if (database) await database.close();
  });

  async function delivery(
    businessId: string | null = null,
    method = 'cod',
    fee = '500',
    cod = '10000',
  ) {
    // ADR-27's method-branched collectable CHECK belongs to D02. The current core CHECK remains cod-only.
    return await source.getRepository(Delivery).save({
      trackingCode: randomUUID(),
      secureTrackingToken: randomUUID(),
      createdByUserId: sender.id,
      businessId,
      driverId: driver.id,
      currency: 'USD',
      deliveryFee: fee,
      codAmount: cod,
      collectableAmount: (BigInt(fee) + BigInt(cod)).toString(),
      paymentMethod: method as Delivery['paymentMethod'],
    });
  }

  function senderEntry(
    d: Delivery,
    entryType: 'DELIVERY_FEE_CHARGED' | 'COD_PAYABLE',
    amount: string,
  ): LedgerEntryInput {
    return {
      entryType,
      amount,
      currency: 'USD',
      deliveryId: d.id,
      beneficiaryType: d.businessId ? 'business' : 'user',
      beneficiaryUserId: d.businessId ? null : sender.id,
      beneficiaryBusinessId: d.businessId,
    };
  }
  function earning(
    d: Delivery,
    amount = '400',
    profile = driver,
    user = driverUser,
  ): LedgerEntryInput {
    return {
      entryType: 'DRIVER_EARNING',
      amount,
      currency: 'USD',
      deliveryId: d.id,
      driverId: profile.id,
      beneficiaryType: 'user',
      beneficiaryUserId: user.id,
    };
  }
  function event(
    kind: LedgerEventInput['kind'],
    sourceId: string,
    entries: LedgerEntryInput[],
    createdById: string | null = actor.id,
  ): LedgerEventInput {
    return { kind, sourceId, entries, createdById, occurredAt };
  }
  function priced(d: Delivery, amount = '400', revenue = '100') {
    return event('priced', d.id, [
      senderEntry(d, 'DELIVERY_FEE_CHARGED', d.deliveryFee),
      ...(amount === '0' ? [] : [earning(d, amount)]),
      ...(revenue === '0'
        ? []
        : [
            {
              entryType: 'PLATFORM_DELIVERY_REVENUE' as const,
              amount: revenue,
              currency: 'USD' as const,
              deliveryId: d.id,
              beneficiaryType: 'platform' as const,
            },
          ]),
    ]);
  }
  function reversal(entry: LedgerEntry): LedgerEntryInput {
    return {
      entryType: 'REVERSAL',
      amount: entry.amount,
      currency: entry.currency,
      deliveryId: entry.deliveryId,
      driverId: entry.driverId,
      beneficiaryType: entry.beneficiaryType,
      beneficiaryUserId: entry.beneficiaryUserId,
      beneficiaryBusinessId: entry.beneficiaryBusinessId,
      periodStart: entry.periodStart,
      reversesEntryId: entry.id,
      description: 'Approved correction',
    };
  }
  const balance = (type: 'driver' | 'user' | 'business', id: string) =>
    ledger.deriveBalance({ type, id, currency: 'USD' });

  it('upgrades a populated C05 schema, reverses and reapplies the additive migration without touching existing data', async () => {
    const legacy = await createPostgisDatabase(
      entities,
      migrations.filter(
        (m) =>
          ![
            AddImmutableLedger1700000000014,
            AddPricedSnapshots1700000000015,
            AllowUnassignedEarningReplacement1700000000016,
          ].includes(m),
      ),
    );
    try {
      const user = await legacy.dataSource
        .getRepository(User)
        .save({ phone: '+96171086999', displayName: 'Preserved C05 user' });
      const migration = new AddImmutableLedger1700000000014();
      for (const direction of ['up', 'down', 'up'] as const) {
        await legacy.dataSource.transaction(async (manager) => {
          await migration[direction](manager.queryRunner!);
        });
        expect(
          await legacy.dataSource
            .getRepository(User)
            .findOneByOrFail({ id: user.id }),
        ).toEqual(user);
      }
      const columns: { column_name: string }[] = await legacy.dataSource.query(
        `SELECT column_name FROM information_schema.columns WHERE table_name='ledger_entries'`,
      );
      expect(columns.map((c) => c.column_name).sort()).toEqual(
        legacy.dataSource
          .getMetadata(LedgerEntry)
          .columns.map((c) => c.propertyName)
          .sort(),
      );
    } finally {
      await legacy.close();
    }
  });

  it('passes public health, unauthenticated denial, public login and bearer access with no public posting route', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/users/me').expect(401);
    const login = await request(app.getHttpServer())
      .post('/auth/login/password')
      .send({ email: actor.email, password: 'c06-test-password' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    for (const method of ['post', 'patch', 'delete'] as const)
      await request(app.getHttpServer())
        [method]('/ledger-entries')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .send({ amount: '1' })
        .expect(404);
  });

  it('replays concurrent events once, retains durable source identity and rejects changed payload', async () => {
    const d = await delivery();
    const input = priced(d);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        ledger.post(input, { userAgent: 'c06-client' }),
      ),
    );
    expect(new Set(results.map((r) => r.event.id)).size).toBe(1);
    expect(
      new Set(results.flatMap((r) => r.entries.map((e) => e.id))).size,
    ).toBe(3);
    expect(
      await source
        .getRepository(AuditLog)
        .countBy({ entityId: results[0].event.id, action: 'ledger.post' }),
    ).toBe(1);
    const persisted = await ledger.findEvent('priced', d.id);
    expect(persisted!.entries.map((e) => e.id)).toEqual(
      results[0].entries.map((e) => e.id),
    );
    await expect(
      ledger.post({
        ...input,
        entries: [
          input.entries[0],
          { ...input.entries[1], amount: '401' },
          { ...input.entries[2], amount: '99' },
        ],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it.each([null, 'business'] as const)(
    'matches ADR-27/28 sender and driver payout cases for %s ownership',
    async (ownership) => {
      const business = ownership
        ? await source.getRepository(Business).save({
            name: 'C06 tenant',
            slug: randomUUID(),
            contactPhone: '+96171086002',
          })
        : null;
      for (const method of ['cod', 'prepaid', 'account']) {
        const d = await delivery(business?.id ?? null, method);
        const beforeSender = BigInt(
          await balance(
            business ? 'business' : 'user',
            business?.id ?? sender.id,
          ),
        );
        const beforeDriver = BigInt(await balance('driver', driver.id));
        await ledger.post(priced(d));
        const collection = await ledger.post(
          event('collection', d.id, [
            {
              entryType: 'COD_COLLECTED',
              amount: '10000',
              currency: 'USD',
              deliveryId: d.id,
              driverId: driver.id,
              beneficiaryType: 'platform',
            },
            senderEntry(d, 'COD_PAYABLE', '10000'),
          ]),
        );
        expect(collection.entries.map((e) => e.amount)).toEqual([
          '10000',
          '10000',
        ]);
        expect(
          BigInt(
            await balance(
              business ? 'business' : 'user',
              business?.id ?? sender.id,
            ),
          ) - beforeSender,
        ).toBe(9500n);
        expect(BigInt(await balance('driver', driver.id)) - beforeDriver).toBe(
          400n,
        );
        await ledger.post(
          event('settlement', randomUUID(), [
            {
              entryType: 'SETTLEMENT',
              amount: '9500',
              currency: 'USD',
              beneficiaryType: business ? 'business' : 'user',
              beneficiaryBusinessId: business?.id,
              beneficiaryUserId: business ? null : sender.id,
            },
          ]),
        );
        await ledger.post(
          event('settlement', randomUUID(), [
            {
              entryType: 'SETTLEMENT',
              amount: '400',
              currency: 'USD',
              driverId: driver.id,
              beneficiaryType: 'user',
              beneficiaryUserId: driverUser.id,
            },
          ]),
        );
        expect(
          BigInt(
            await balance(
              business ? 'business' : 'user',
              business?.id ?? sender.id,
            ),
          ) - beforeSender,
        ).toBe(0n);
        expect(BigInt(await balance('driver', driver.id)) - beforeDriver).toBe(
          0n,
        );
      }
    },
  );

  it('waives a charge by one reversal and deduplicates concurrent driver/type/period sources', async () => {
    const before = BigInt(await balance('driver', driver.id));
    const entry: LedgerEntryInput = {
      entryType: 'DRIVER_DAILY_CHARGE',
      amount: '300',
      currency: 'USD',
      driverId: driver.id,
      beneficiaryType: 'platform',
      periodStart: '2026-11-07',
    };
    const results = await Promise.allSettled([
      ledger.post(event('charge', randomUUID(), [entry])),
      ledger.post(event('charge', randomUUID(), [entry])),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({
      reason: { status: 409 },
    });
    const charge = results.find((r) => r.status === 'fulfilled')!;
    if (charge.status !== 'fulfilled') throw new Error('missing charge');
    expect(BigInt(await balance('driver', driver.id)) - before).toBe(-300n);
    const target = charge.value.entries[0];
    const waive = event('reversal', target.id, [reversal(target)]);
    const waivers = await Promise.all([ledger.post(waive), ledger.post(waive)]);
    expect(waivers[0].entries[0].id).toBe(waivers[1].entries[0].id);
    expect(BigInt(await balance('driver', driver.id)) - before).toBe(0n);
    await expect(
      ledger.post(
        event('refund', randomUUID(), [
          {
            entryType: 'REFUND',
            amount: '300',
            currency: 'USD',
            driverId: driver.id,
            beneficiaryType: 'user',
            beneficiaryUserId: driverUser.id,
          },
          reversal(target),
        ]),
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('reverses cancelled PRICED effects atomically without altering the original event', async () => {
    const d = await delivery();
    const beforeSender = BigInt(await balance('user', sender.id));
    const beforeDriver = BigInt(await balance('driver', driver.id));
    const posted = await ledger.post(priced(d));
    await source.transaction(async (manager) => {
      for (const entry of posted.entries)
        await ledger.postWithManager(
          manager,
          event('reversal', entry.id, [reversal(entry)]),
        );
    });
    expect(BigInt(await balance('user', sender.id)) - beforeSender).toBe(0n);
    expect(BigInt(await balance('driver', driver.id)) - beforeDriver).toBe(0n);
    expect((await ledger.findEvent('priced', d.id))!.entries).toEqual(
      posted.entries,
    );
  });

  it('transfers one earning through a linked replacement chain, rejects changed terms and races safely', async () => {
    const d = await delivery();
    const posted = await ledger.post(priced(d));
    const original = posted.entries.find(
      (entry) => entry.entryType === 'DRIVER_EARNING',
    )!;
    const beforeA = BigInt(await balance('driver', driver.id));
    const beforeB = BigInt(await balance('driver', secondDriver.id));
    const input = event('reassignment', original.id, [
      reversal(original),
      {
        ...earning(d, '400', secondDriver, secondUser),
        replacesEntryId: original.id,
      },
    ]);
    await expect(
      ledger.post({
        ...input,
        entries: [input.entries[0], { ...input.entries[1], amount: '401' }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    const [a, b] = await Promise.all([ledger.post(input), ledger.post(input)]);
    expect(a.event.id).toBe(b.event.id);
    expect(BigInt(await balance('driver', driver.id)) - beforeA).toBe(-400n);
    expect(BigInt(await balance('driver', secondDriver.id)) - beforeB).toBe(
      400n,
    );
    const replacement = a.entries.find(
      (entry) => entry.entryType === 'DRIVER_EARNING',
    )!;
    await ledger.post(
      event('reassignment', replacement.id, [
        reversal(replacement),
        { ...earning(d), replacesEntryId: replacement.id },
      ]),
    );
    expect(BigInt(await balance('driver', driver.id)) - beforeA).toBe(0n);
    expect(BigInt(await balance('driver', secondDriver.id)) - beforeB).toBe(0n);
    expect((await ledger.findEvent('priced', d.id))!.entries).toEqual(
      posted.entries,
    );
  });

  it('records shortage/credit adjustments with exact signs and keeps unrelated tenants and driver/sender roles separate', async () => {
    const d = await delivery();
    const collection = await ledger.post(
      event('collection', d.id, [
        {
          entryType: 'COD_COLLECTED',
          amount: '10000',
          currency: 'USD',
          deliveryId: d.id,
          driverId: driver.id,
          beneficiaryType: 'platform',
        },
        senderEntry(d, 'COD_PAYABLE', '10000'),
      ]),
    );
    const before = BigInt(await balance('driver', driver.id));
    const beforeSender = await balance('user', sender.id);
    const target = collection.entries[0];
    const input = event('adjustment', randomUUID(), [
      {
        entryType: 'ADJUSTMENT',
        amount: '1000',
        currency: 'USD',
        deliveryId: d.id,
        driverId: driver.id,
        beneficiaryType: 'platform',
        adjustsEntryId: target.id,
        description: '10000 collected, 9000 remitted',
      },
    ]);
    await ledger.post(input);
    expect(BigInt(await balance('driver', driver.id)) - before).toBe(-1000n);
    expect(await balance('user', sender.id)).toBe(beforeSender);
    await ledger.post({
      ...input,
      sourceId: randomUUID(),
      entries: [
        {
          ...input.entries[0],
          beneficiaryType: 'user',
          beneficiaryUserId: driverUser.id,
        },
      ],
    });
    expect(BigInt(await balance('driver', driver.id)) - before).toBe(0n);
    const payable = collection.entries[1];
    await ledger.post(
      event('adjustment', randomUUID(), [
        {
          entryType: 'ADJUSTMENT',
          amount: '50',
          currency: 'USD',
          deliveryId: d.id,
          beneficiaryType: 'platform',
          adjustsEntryId: payable.id,
          description: 'Sender debit correction',
        },
      ]),
    );
    expect(
      BigInt(await balance('user', sender.id)) - BigInt(beforeSender),
    ).toBe(-50n);
    await expect(
      ledger.post(
        event('adjustment', randomUUID(), [
          { ...input.entries[0], driverId: secondDriver.id },
        ]),
      ),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      ledger.post(
        event('priced', (await delivery()).id, [
          senderEntry(d, 'DELIVERY_FEE_CHARGED', '500'),
        ]),
      ),
    ).rejects.toMatchObject({ status: 400 });
    const tenants = await source.getRepository(Business).save([
      { name: 'Tenant A', slug: randomUUID(), contactPhone: '+96171086002' },
      { name: 'Tenant B', slug: randomUUID(), contactPhone: '+96171086002' },
    ]);
    const businessDelivery = await delivery(tenants[0].id);
    const tenantInput = priced(businessDelivery);
    await expect(
      ledger.post({
        ...tenantInput,
        entries: [
          { ...tenantInput.entries[0], beneficiaryBusinessId: tenants[1].id },
          ...tenantInput.entries.slice(1),
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(await ledger.findEvent('priced', businessDelivery.id)).toBeNull();
    expect(await balance('business', tenants[1].id)).toBe('0');
    expect(await balance('business', randomUUID())).toBe('0');
    expect(await balance('user', driverUser.id)).toBe('0');
    await expect(
      ledger.deriveBalance({
        type: 'driver',
        id: driver.id,
        currency: 'LBP' as 'USD',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('records refund cash separately from the linked obligation reversal without counting it twice', async () => {
    const d = await delivery();
    const before = BigInt(await balance('user', sender.id));
    const collected = await ledger.post(
      event('collection', d.id, [
        {
          entryType: 'COD_COLLECTED',
          amount: '10000',
          currency: 'USD',
          deliveryId: d.id,
          driverId: driver.id,
          beneficiaryType: 'platform',
        },
        senderEntry(d, 'COD_PAYABLE', '10000'),
      ]),
    );
    const refund = event('refund', randomUUID(), [
      {
        entryType: 'REFUND',
        amount: '10000',
        currency: 'USD',
        deliveryId: d.id,
        beneficiaryType: 'user',
        beneficiaryUserId: sender.id,
      },
      reversal(collected.entries[1]),
    ]);
    await expect(
      ledger.post({
        ...refund,
        sourceId: randomUUID(),
        entries: [
          { ...refund.entries[0], beneficiaryUserId: secondUser.id },
          refund.entries[1],
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    const posted = await ledger.post(refund);
    expect((await ledger.post(refund)).event.id).toBe(posted.event.id);
    expect(BigInt(await balance('user', sender.id)) - before).toBe(0n);
    expect(posted.entries.map((e) => e.entryType)).toEqual([
      'REFUND',
      'REVERSAL',
    ]);
    // The collection remains an immutable fact even when its payable is reversed.
    await expect(
      ledger.post(
        event('reversal', collected.entries[0].id, [
          reversal(collected.entries[0]),
        ]),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('retains zero shares and bigint precision, including system-origin and zero-row events', async () => {
    const zero = await delivery(null, 'cod', '0', '0');
    const empty = await ledger.post(event('priced', zero.id, [], null));
    expect(empty.entries).toEqual([]);
    expect(
      (await ledger.post(event('priced', zero.id, [], null))).event.id,
    ).toBe(empty.event.id);
    const d = await delivery();
    expect(
      (await ledger.post(priced(d, '0', '500'))).entries.map(
        (entry) => entry.entryType,
      ),
    ).toEqual(['DELIVERY_FEE_CHARGED', 'PLATFORM_DELIVERY_REVENUE']);
    expect(
      allocateDeliveryFee(
        {
          deliveryAllocation: {
            platformFixedAmount: '0',
            platformPercentage: 20,
            driverFixedAmount: '0',
            driverPercentage: 0,
            driverGetsRemainder: true,
          },
          recurringCharge: {
            type: 'NONE',
            amountMinorUnits: '0',
            currency: 'USD',
          },
        },
        '500',
      ),
    ).toEqual({ platformShareMinorUnits: '100', driverShareMinorUnits: '400' });
    const big = await delivery(null, 'cod', '9007199254740993', '0');
    const before = BigInt(await balance('driver', driver.id));
    const posted = await ledger.post({
      ...priced(big, '9007199254740993', '0'),
      createdById: null,
    });
    expect(posted.entries[1].amount).toBe('9007199254740993');
    expect(BigInt(await balance('driver', driver.id)) - before).toBe(
      9007199254740993n,
    );
    expect(posted.entries[1].createdById).toBeNull();
  });

  it('rolls back postings and human audit with its caller transaction and rejects inactive actors', async () => {
    const d = await delivery();
    const count = await source
      .getRepository(AuditLog)
      .countBy({ action: 'ledger.post' });
    await expect(
      source.transaction(async (manager) => {
        await ledger.postWithManager(manager, priced(d));
        throw new Error('outer workflow failed');
      }),
    ).rejects.toThrow('outer workflow failed');
    expect(await ledger.findEvent('priced', d.id)).toBeNull();
    expect(
      await source.getRepository(AuditLog).countBy({ action: 'ledger.post' }),
    ).toBe(count);
    await expect(
      ledger.postWithManager(source.manager, priced(d)),
    ).rejects.toThrow('active transaction');
    const inactive = await source.getRepository(User).save({
      phone: '+96171086005',
      displayName: 'Inactive',
      status: 'suspended' as User['status'],
    });
    await expect(
      ledger.post({ ...priced(d), createdById: inactive.id }),
    ).rejects.toMatchObject({ status: 403 });
    expect(await ledger.findEvent('priced', d.id)).toBeNull();
    await ledger.post(priced(d), { userAgent: 'c06-rollback-client' });
    const saved = (await ledger.findEvent('priced', d.id))!;
    expect(
      await source
        .getRepository(AuditLog)
        .findOneBy({ entityId: saved.event.id }),
    ).toMatchObject({ userAgent: 'c06-rollback-client' });
  });

  it('enforces immutability, beneficiary, positive USD, source and complete-group integrity without the service', async () => {
    const posted = await ledger.post(priced(await delivery()));
    for (const table of ['ledger_entries', 'ledger_events']) {
      const id =
        table === 'ledger_entries' ? posted.entries[0].id : posted.event.id;
      await expect(
        source.query(`UPDATE "${table}" SET id=id WHERE id=$1`, [id]),
      ).rejects.toMatchObject({ code: 'P0001' });
      await expect(
        source.query(`DELETE FROM "${table}" WHERE id=$1`, [id]),
      ).rejects.toMatchObject({ code: 'P0001' });
      await expect(
        source.query(`TRUNCATE "${table}" CASCADE`),
      ).rejects.toMatchObject({ code: 'P0001' });
    }
    const clone = async (changes: Partial<LedgerEntry> = {}) => {
      const original = posted.entries[0];
      const { id: _id, ...fields } = original;
      return await source
        .getRepository(LedgerEntry)
        .save({ ...fields, id: randomUUID(), ...changes });
    };
    await expect(clone({ amount: '0' })).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    await expect(clone({ amount: '-1' })).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    await expect(clone({ currency: 'LBP' as 'USD' })).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    await expect(
      clone({ beneficiaryUserId: secondUser.id }),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(clone()).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
    await expect(
      source.transaction(async (manager) => {
        await manager.getRepository(LedgerEvent).insert({
          kind: 'collection',
          sourceId: randomUUID(),
          payloadHash: 'a'.repeat(64),
          entryCount: 2,
          createdById: null,
          occurredAt: new Date(occurredAt),
        });
      }),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    await expect(
      ledger.post(event('collection', randomUUID(), [])),
    ).rejects.toMatchObject({ status: 400 });
    const invalid = await delivery();
    await expect(
      ledger.post(
        event('collection', invalid.id, [
          {
            entryType: 'COD_COLLECTED',
            amount: '10000',
            currency: 'USD',
            deliveryId: invalid.id,
            driverId: driver.id,
            beneficiaryType: 'platform',
          },
        ]),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(await ledger.findEvent('collection', invalid.id)).toBeNull();
    await expect(
      ledger.post(
        event('priced', invalid.id, [
          senderEntry(invalid, 'DELIVERY_FEE_CHARGED', '500'),
          earning(invalid, '499'),
        ]),
      ),
    ).rejects.toMatchObject({ status: 400 });
    expect(await ledger.findEvent('priced', invalid.id)).toBeNull();
  });
});
