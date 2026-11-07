import { AddPricedSnapshots1700000000015 } from '../src/database/migrations/1700000000015-AddPricedSnapshots';
import { DeliveryFinancialSnapshot } from '../src/modules/finance/entities/delivery-financial-snapshot.entity';
import { AddImmutableLedger1700000000014 } from '../src/database/migrations/1700000000014-AddImmutableLedger';
import { LedgerEntry } from '../src/modules/finance/entities/ledger-entry.entity';
import { LedgerEvent } from '../src/modules/finance/entities/ledger-event.entity';
import { globSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { hash } from 'argon2';
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
import { AddDriverCompensationPlans1700000000013 } from '../src/database/migrations/1700000000013-AddDriverCompensationPlans';
import { Address } from '../src/modules/addresses/entities/address.entity';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { IdempotencyKey } from '../src/modules/idempotency/entities/idempotency-key.entity';
import { BusinessMember } from '../src/modules/businesses/entities/business-member.entity';
import { Business } from '../src/modules/businesses/entities/business.entity';
import { DeliveryAddress } from '../src/modules/deliveries/entities/delivery-address.entity';
import { DeliveryStatusHistory } from '../src/modules/deliveries/entities/delivery-status-history.entity';
import { Delivery } from '../src/modules/deliveries/entities/delivery.entity';
import { Recipient } from '../src/modules/deliveries/entities/recipient.entity';
import { PricingRule } from '../src/modules/pricing/entities/pricing-rule.entity';
import { Region } from '../src/modules/regions/entities/region.entity';
import { AdminRoleAssignment } from '../src/modules/users/entities/admin-role-assignment.entity';
import { DriverCompensationPlan } from '../src/modules/finance/entities/driver-compensation-plan.entity';
import { DriverPlanAssignment } from '../src/modules/finance/entities/driver-plan-assignment.entity';
import { DriverProfile } from '../src/modules/users/entities/driver-profile.entity';
import { RefreshToken } from '../src/modules/users/entities/refresh-token.entity';
import { User, UserStatus } from '../src/modules/users/entities/user.entity';
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
];

describe('Entity relationships against the migrated PostGIS schema', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;

  beforeAll(async () => {
    database = await createPostgisDatabase(entities, migrations);
  });

  afterAll(async () => {
    if (database) await database.close();
  });

  it('discovers compiled entities through the CLI DataSource after reversed imports', async () => {
    const connection = database.connection;
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [
        '-e',
        `
      require('reflect-metadata');
      const { globSync } = require('node:fs');
      const { resolve } = require('node:path');
      for (const file of globSync('dist/**/*.entity.js').reverse()) require(resolve(file));
      const source = require('./dist/database/data-source').default;
      (async () => {
        try {
          await source.initialize();
          if (source.entityMetadatas.length !== 21) throw new Error('Wrong entity count');
          for (const metadata of source.entityMetadatas) {
            for (const relation of metadata.relations) {
              if (relation.inverseRelation?.inverseRelation !== relation) throw new Error('Broken inverse relation');
              await source.getRepository(metadata.target).find({ relations: [relation.propertyName], take: 1, order: { id: 'ASC' } });
            }
          }
          console.log('compiled-relations-ok');
        } finally { if (source.isInitialized) await source.destroy(); }
      })().catch(() => { process.exitCode = 1; });
    `,
      ],
      {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          DB_HOST: connection.host,
          DB_PORT: String(connection.port),
          DB_NAME: connection.database,
          DB_USER: connection.username,
          DB_PASSWORD: connection.password,
        },
        timeout: 15_000,
      },
    );
    expect(stdout).toContain('compiled-relations-ok');
  });

  it('serves public, denied, login and bearer-authenticated calls from the compiled entrypoint', async () => {
    // Exercise Node's CommonJS imports and emitted decorators separately from Vitest.
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    const connection = database.connection;
    const email = `compiled-${randomUUID()}@example.test`;
    const password = 'compiled-smoke-password';
    await database.dataSource.getRepository(User).save({
      phone: '+96170000001',
      email,
      displayName: 'Compiled smoke user',
      passwordHash: await hash(password),
      status: UserStatus.ACTIVE,
    });
    const child = spawn(process.execPath, ['dist/main.js'], {
      env: {
        ...process.env,
        APP_ENV: 'test',
        APP_HOST: '127.0.0.1',
        APP_PORT: String(port),
        CORS_ORIGINS: 'http://localhost:5173',
        OTP_STATE: 'memory',
        DB_HOST: connection.host,
        DB_PORT: String(connection.port),
        DB_USER: connection.username,
        DB_PASSWORD: connection.password,
        DB_NAME: connection.database,
        JWT_ACCESS_SECRET: randomUUID(),
        JWT_REFRESH_SECRET: randomUUID(),
      },
      stdio: 'ignore',
    });
    const exited = once(child, 'exit');
    try {
      let response: Response | undefined;
      for (let attempt = 0; attempt < 60; attempt += 1) {
        expect(
          child.exitCode,
          'compiled backend exited before listening',
        ).toBeNull();
        try {
          response = await fetch(`http://127.0.0.1:${port}/health`, {
            headers: { Origin: 'http://localhost:5173' },
            signal: AbortSignal.timeout(1000),
          });
          break;
        } catch {
          await setTimeout(100);
        }
      }
      expect(
        response,
        'compiled backend did not begin listening',
      ).toBeDefined();
      expect(response!.status).toBe(200);
      expect(await response!.json()).toMatchObject({
        status: 'ok',
        info: { database: { status: 'up' } },
      });
      expect(response!.headers.get('x-content-type-options')).toBe('nosniff');
      expect(response!.headers.get('access-control-allow-origin')).toBe(
        'http://localhost:5173',
      );

      const disallowedOrigin = await fetch(`http://127.0.0.1:${port}/health`, {
        headers: { Origin: 'https://malicious.example' },
      });
      expect(disallowedOrigin.status).toBe(200);
      expect(
        disallowedOrigin.headers.get('access-control-allow-origin'),
      ).toBeNull();

      const denied = await fetch(`http://127.0.0.1:${port}/users/me`);
      expect(denied.status).toBe(401);

      const login = await fetch(
        `http://127.0.0.1:${port}/auth/login/password`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        },
      );
      expect(login.status).toBe(200);
      const tokens = (await login.json()) as { accessToken: string };
      expect(tokens.accessToken).toEqual(expect.any(String));

      const profile = await fetch(`http://127.0.0.1:${port}/users/me`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      expect(profile.status).toBe(200);
      expect(await profile.json()).toMatchObject({
        email,
        displayName: 'Compiled smoke user',
        status: UserStatus.ACTIVE,
      });
    } finally {
      if (child.exitCode === null) {
        child.kill('SIGTERM');
        await Promise.race([
          exited,
          setTimeout(5000, undefined, { ref: false }),
        ]);
        if (child.exitCode === null && child.signalCode === null) {
          child.kill('SIGKILL');
          await exited;
        }
      }
    }
  });

  async function seedGraph() {
    const source = database.dataSource;
    const suffix = randomUUID();
    const user = await source.getRepository(User).save({
      phone: `+${suffix.replace(/\D/g, '').slice(0, 15)}`,
      displayName: 'Relation actor',
    });
    const parent = await source.getRepository(Region).save({
      type: 'governorate' as Region['type'],
      code: suffix.slice(0, 12),
      name: 'Parent',
    });
    const region = await source.getRepository(Region).save({
      type: 'area' as Region['type'],
      code: suffix.slice(12, 24),
      name: 'Child',
      parentId: parent.id,
    });
    const business = await source.getRepository(Business).save({
      name: 'Relations business',
      slug: suffix,
      contactPhone: user.phone,
    });
    const member = await source
      .getRepository(BusinessMember)
      .save({ businessId: business.id, userId: user.id });
    const driver = await source
      .getRepository(DriverProfile)
      .save({ userId: user.id, vehicleType: 'bike' });
    const plan = await source.getRepository(DriverCompensationPlan).save({
      name: 'Relation plan',
      type: 'PER_DELIVERY' as DriverCompensationPlan['type'],
      components: {
        deliveryAllocation: {
          platformFixedAmount: '0',
          platformPercentage: 0,
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
    });
    const assignment = await source.getRepository(DriverPlanAssignment).save({
      driverId: driver.id,
      planId: plan.id,
      createdById: user.id,
      effectiveFrom: new Date('2026-01-01T00:00:00Z'),
    });
    const role = await source.getRepository(AdminRoleAssignment).save({
      userId: user.id,
      grantedById: user.id,
      role: 'admin' as AdminRoleAssignment['role'],
    });
    const token = await source.getRepository(RefreshToken).save({
      userId: user.id,
      tokenHash: suffix,
      expiresAt: new Date(Date.now() + 60_000),
    });
    const address = await source
      .getRepository(Address)
      .save({ userId: user.id, regionId: region.id, city: 'Beirut' });
    const zone = await source.getRepository(DeliveryZone).save({
      businessId: business.id,
      name: 'Test zone',
      boundary: {
        type: 'Polygon',
        coordinates: [
          [
            [35, 33],
            [36, 33],
            [36, 34],
            [35, 33],
          ],
        ],
      },
    });
    const pricing = await source
      .getRepository(PricingRule)
      .save({ businessId: business.id, zoneId: zone.id, baseFee: '100' });
    const delivery = await source.getRepository(Delivery).save({
      trackingCode: suffix,
      secureTrackingToken: suffix,
      createdByUserId: user.id,
      businessId: business.id,
      driverId: driver.id,
      zoneId: zone.id,
    });
    const snapshot = {
      deliveryId: delivery.id,
      regionId: region.id,
      city: 'Beirut',
      latitude: 33.9,
      longitude: 35.5,
    };
    const recipient = await source.getRepository(Recipient).save({
      ...snapshot,
      userId: user.id,
      name: 'Historical recipient',
      phone: user.phone,
    });
    const pickup = await source.getRepository(DeliveryAddress).save(snapshot);
    const history = await source.getRepository(DeliveryStatusHistory).save({
      deliveryId: delivery.id,
      toStatus: 'CREATED',
      actorType: 'user' as DeliveryStatusHistory['actorType'],
      actorId: user.id,
    });
    const audit = await source.getRepository(AuditLog).save({
      actorId: user.id,
      businessId: business.id,
      action: 'member.add',
      entityType: 'BusinessMember',
      entityId: member.id,
    });
    const idempotency = await source.getRepository(IdempotencyKey).save({
      userId: user.id,
      operationType: 'delivery.create',
      idempotencyKey: suffix,
      payloadHash: 'a'.repeat(64),
      resultantAggregateId: delivery.id,
      responsePayload: { id: delivery.id },
      expiresAt: new Date(Date.now() + 3_600_000),
    });
    const ledger = await source.transaction(async (manager) => {
      const event = await manager.getRepository(LedgerEvent).save({
        kind: 'charge',
        sourceId: randomUUID(),
        payloadHash: 'a'.repeat(64),
        entryCount: 1,
        createdById: user.id,
        occurredAt: new Date('2026-11-07T08:00:00Z'),
      });
      const entry = await manager.getRepository(LedgerEntry).save({
        eventId: event.id,
        eventIndex: 0,
        entryType: 'DRIVER_DAILY_CHARGE',
        amount: '300',
        currency: 'USD',
        driverId: driver.id,
        beneficiaryType: 'platform',
        periodStart: '2026-11-07',
        referenceType: 'charge',
        referenceId: event.sourceId,
        createdById: user.id,
        occurredAt: event.occurredAt,
      });
      return { event, entry };
    });
    const financialSnapshot = await source.transaction(async (manager) => {
      const quote = {
        pricingRuleId: pricing.id,
        pricingRuleEffectiveFrom: pricing.effectiveFrom.toISOString(),
        distanceKm: 0,
        baseFee: '0',
        zoneSurcharge: '0',
        perKmFee: '0',
        codFee: '0',
        totalFee: '0',
        currency: 'USD',
      };
      await manager.getRepository(Delivery).update(delivery.id, {
        pricingRuleId: pricing.id,
        feeBreakdown: quote,
      });
      await manager.getRepository(LedgerEvent).save({
        kind: 'priced',
        sourceId: delivery.id,
        payloadHash: 'a'.repeat(64),
        entryCount: 0,
        createdById: null,
        occurredAt: new Date(),
      });
      return await manager.getRepository(DeliveryFinancialSnapshot).save({
        deliveryId: delivery.id,
        currency: 'USD',
        customerDeliveryFee: '0',
        driverEarnings: '0',
        platformDeliveryRevenue: '0',
        pricingRuleId: pricing.id,
        driverCompensationPlanId: plan.id,
        driverPlanAssignmentId: assignment.id,
        lockedAt: new Date(),
        eligibleFeeComponents: {
          ...quote,
          totalEligibleFee: '0',
          paymentMethod: delivery.paymentMethod,
        },
      });
    });
    return {
      financialSnapshot,
      user,
      parent,
      region,
      business,
      member,
      driver,
      plan,
      assignment,
      role,
      token,
      address,
      zone,
      pricing,
      delivery,
      recipient,
      pickup,
      history,
      audit,
      idempotency,
      ledger,
    };
  }

  it('loads all owning and inverse navigations using FK-only inserts, including the region tree', async () => {
    const graph = await seedGraph();
    const source = database.dataSource;
    const rows = new Map([
      [DeliveryFinancialSnapshot, graph.financialSnapshot],
      [LedgerEvent, graph.ledger.event],
      [LedgerEntry, graph.ledger.entry],
      [User, graph.user],
      [Region, graph.region],
      [Business, graph.business],
      [BusinessMember, graph.member],
      [DriverProfile, graph.driver],
      [DriverCompensationPlan, graph.plan],
      [DriverPlanAssignment, graph.assignment],
      [AdminRoleAssignment, graph.role],
      [RefreshToken, graph.token],
      [Address, graph.address],
      [DeliveryZone, graph.zone],
      [PricingRule, graph.pricing],
      [Delivery, graph.delivery],
      [Recipient, graph.recipient],
      [DeliveryAddress, graph.pickup],
      [DeliveryStatusHistory, graph.history],
      [AuditLog, graph.audit],
      [IdempotencyKey, graph.idempotency],
    ] as [Function, { id: string }][]);
    for (const metadata of source.entityMetadatas) {
      const row = rows.get(metadata.target as Function)!;
      const loaded = await source.getRepository(metadata.target).findOneOrFail({
        where: { id: row.id },
        relations: metadata.relations.map((relation) => relation.propertyName),
      });
      for (const relation of metadata.relations) {
        const value = loaded[relation.propertyName] as
          { id: string } | { id: string }[] | null;
        if (relation.isOwning) {
          const foreignKey = loaded[relation.joinColumns[0].propertyName];
          if (foreignKey === null) expect(value).toBeNull();
          else expect((value as { id: string }).id).toBe(foreignKey);
        } else {
          const child = rows.get(
            relation.inverseEntityMetadata.target as Function,
          )!;
          const foreignKey =
            relation.inverseRelation!.joinColumns[0].propertyName;
          const belongs =
            (child as Record<string, unknown>)[foreignKey] === row.id;
          if (relation.isOneToMany)
            expect((value as { id: string }[]).map((item) => item.id)).toEqual(
              belongs ? [child.id] : [],
            );
          else
            expect((value as { id: string } | null)?.id ?? null).toBe(
              belongs ? child.id : null,
            );
        }
      }
    }
    const parent = await source.getRepository(Region).findOneOrFail({
      where: { id: graph.parent.id },
      relations: { children: true, parent: true },
    });
    expect(parent.children?.map((child) => child.id)).toEqual([
      graph.region.id,
    ]);
    expect(parent.parent).toBeNull();
  });

  it('distinguishes unloaded, absent and nullable relationships for personal deliveries', async () => {
    const source = database.dataSource;
    const user = await source
      .getRepository(User)
      .save({ phone: '+96179991001', displayName: 'Personal sender' });
    const delivery = await source.getRepository(Delivery).save({
      createdByUserId: user.id,
      trackingCode: randomUUID(),
      secureTrackingToken: randomUUID(),
    });
    const plain = await source
      .getRepository(Delivery)
      .findOneByOrFail({ id: delivery.id });
    expect(plain.createdByUser).toBeUndefined();
    expect(plain.statusHistory).toBeUndefined();
    const loaded = await source.getRepository(Delivery).findOneOrFail({
      where: { id: delivery.id },
      relations: {
        createdByUser: true,
        business: true,
        driver: true,
        zone: true,
        recipient: true,
        pickupAddress: true,
        statusHistory: true,
      },
    });
    expect(loaded.createdByUser?.id).toBe(user.id);
    expect(loaded.business).toBeNull();
    expect(loaded.driver).toBeNull();
    expect(loaded.zone).toBeNull();
    expect(loaded.recipient).toBeNull();
    expect(loaded.pickupAddress).toBeNull();
    expect(loaded.statusHistory).toEqual([]);
  });

  it('retains required user FKs when soft-delete filtering hides the related user', async () => {
    const graph = await seedGraph();
    const source = database.dataSource;
    await source.getRepository(User).softDelete(graph.user.id);
    const address = await source.getRepository(Address).findOneOrFail({
      where: { id: graph.address.id },
      relations: { user: true },
    });
    expect(address.userId).toBe(graph.user.id);
    expect(address.user).toBeNull();
    const historical = await source.getRepository(Address).findOneOrFail({
      where: { id: graph.address.id },
      relations: { user: true },
      withDeleted: true,
    });
    expect(historical.user?.id).toBe(graph.user.id);
    expect(historical.user?.deletedAt).toBeInstanceOf(Date);
  });

  it('persists owning relation objects and preserves snapshots when saving inverse navigations', async () => {
    const graph = await seedGraph();
    const source = database.dataSource;
    const address = await source
      .getRepository(Address)
      .save({ user: graph.user, region: graph.region, city: 'Tripoli' });
    const stored = await source
      .getRepository(Address)
      .findOneByOrFail({ id: address.id });
    expect(stored.userId).toBe(graph.user.id);
    expect(stored.regionId).toBe(graph.region.id);

    const delivery = await source.getRepository(Delivery).findOneOrFail({
      where: { id: graph.delivery.id },
      relations: {
        recipient: true,
        pickupAddress: true,
        statusHistory: true,
      },
    });
    delivery.recipient = null;
    delivery.pickupAddress = null;
    delivery.statusHistory = [];
    delivery.notes = 'Save scalar field';
    await source.getRepository(Delivery).save(delivery);
    const reloaded = await source.getRepository(Delivery).findOneOrFail({
      where: { id: delivery.id },
      relations: {
        recipient: true,
        pickupAddress: true,
        statusHistory: true,
      },
    });
    expect(reloaded.recipient?.id).toBe(graph.recipient.id);
    expect(reloaded.pickupAddress?.id).toBe(graph.pickup.id);
    expect(reloaded.statusHistory?.map((item) => item.id)).toEqual([
      graph.history.id,
    ]);
    expect(reloaded.notes).toBe('Save scalar field');
  });

  it('enforces real FK deletion rules and unique one-to-one ownership', async () => {
    const graph = await seedGraph();
    const source = database.dataSource;
    await expect(
      source
        .getRepository(DriverProfile)
        .save({ userId: graph.user.id, vehicleType: 'car' }),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      source.getRepository(Recipient).save({
        deliveryId: graph.delivery.id,
        name: 'Duplicate',
        phone: graph.user.phone,
        city: 'Beirut',
        latitude: 33.9,
        longitude: 35.5,
      }),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      source.getRepository(DeliveryAddress).save({
        deliveryId: graph.delivery.id,
        city: 'Beirut',
        latitude: 33.9,
        longitude: 35.5,
      }),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(
      source.getRepository(Business).delete(graph.business.id),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      source.getRepository(User).delete(graph.user.id),
    ).rejects.toMatchObject({ code: '23503' });

    await expect(
      source.getRepository(DriverProfile).delete(graph.driver.id),
    ).rejects.toMatchObject({ code: '23503' });
    await source.getRepository(DeliveryZone).delete(graph.zone.id);
    // Snapshot immutability triggers intentionally block SET NULL/CASCADE
    // actions which would mutate or remove historical recipient/pickup rows.
    await expect(
      source.getRepository(Region).delete(graph.region.id),
    ).rejects.toMatchObject({ code: 'P0001' });
    const delivery = await source.getRepository(Delivery).findOneOrFail({
      where: { id: graph.delivery.id },
      relations: {
        driver: true,
        zone: true,
        recipient: { region: true },
        pickupAddress: { region: true },
      },
    });
    expect(delivery.driverId).toBe(graph.driver.id);
    expect(delivery.driver?.id).toBe(graph.driver.id);
    expect(delivery.zoneId).toBeNull();
    expect(delivery.zone).toBeNull();
    expect(delivery.recipient?.region?.id).toBe(graph.region.id);
    expect(delivery.pickupAddress?.region?.id).toBe(graph.region.id);
    expect(
      (
        await source
          .getRepository(PricingRule)
          .findOneByOrFail({ id: graph.pricing.id })
      ).zoneId,
    ).toBeNull();
    expect(
      (
        await source
          .getRepository(Address)
          .findOneByOrFail({ id: graph.address.id })
      ).regionId,
    ).toBe(graph.region.id);

    await expect(
      source.getRepository(Delivery).delete(graph.delivery.id),
    ).rejects.toMatchObject({ code: 'P0001' });
    expect(
      await source
        .getRepository(Recipient)
        .findOneBy({ id: graph.recipient.id }),
    ).toMatchObject({ id: graph.recipient.id, deliveryId: graph.delivery.id });
    expect(
      await source
        .getRepository(DeliveryAddress)
        .findOneBy({ id: graph.pickup.id }),
    ).toMatchObject({ id: graph.pickup.id, deliveryId: graph.delivery.id });
    expect(
      await source
        .getRepository(DeliveryStatusHistory)
        .findOneBy({ id: graph.history.id }),
    ).toMatchObject({ id: graph.history.id, deliveryId: graph.delivery.id });
    expect(
      await source.getRepository(Delivery).findOneBy({ id: graph.delivery.id }),
    ).not.toBeNull();
  });

  it('maps every database FK with matching target, nullability, deletion and cardinality', async () => {
    const source = database.dataSource;
    const foreignKeys: {
      table_name: string;
      column_name: string;
      target_table: string;
      target_column: string;
      nullable: boolean;
      on_delete: string;
      unique_fk: boolean;
    }[] = await source.query(`
      SELECT tbl.relname AS table_name, col.attname AS column_name,
             target.relname AS target_table, target_col.attname AS target_column,
             NOT col.attnotnull AS nullable,
             CASE fk.confdeltype WHEN 'a' THEN 'NO ACTION' WHEN 'r' THEN 'RESTRICT'
               WHEN 'c' THEN 'CASCADE' WHEN 'n' THEN 'SET NULL' END AS on_delete,
             EXISTS (SELECT 1 FROM pg_index idx WHERE idx.indrelid = tbl.oid
               AND idx.indisunique AND idx.indpred IS NULL
               AND idx.indnkeyatts = 1 AND idx.indkey[0] = col.attnum) AS unique_fk
      FROM pg_constraint fk
      JOIN pg_class tbl ON tbl.oid = fk.conrelid
      JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
      JOIN pg_class target ON target.oid = fk.confrelid
      JOIN pg_attribute col ON col.attrelid = tbl.oid AND col.attnum = fk.conkey[1]
      JOIN pg_attribute target_col ON target_col.attrelid = target.oid AND target_col.attnum = fk.confkey[1]
      WHERE fk.contype = 'f' AND ns.nspname = 'public'
      ORDER BY tbl.relname, col.attname
    `);
    expect(entities).toHaveLength(globSync('src/**/*.entity.ts').length);
    expect(foreignKeys).toHaveLength(39);
    const owning = source.entityMetadatas.flatMap((metadata) =>
      metadata.relations.filter((relation) => relation.isOwning),
    );
    expect(owning).toHaveLength(foreignKeys.length);
    for (const fk of foreignKeys) {
      const metadata = source.entityMetadatas.find(
        (entity) => entity.tableName === fk.table_name,
      )!;
      const relation = metadata.relations.find(
        (rel) =>
          rel.isOwning &&
          rel.joinColumns.some((col) => col.databaseName === fk.column_name),
      );
      expect(relation, `${fk.table_name}.${fk.column_name}`).toBeDefined();
      expect(relation!.joinColumns).toHaveLength(1);
      expect(relation!.joinColumns[0].referencedColumn!.databaseName).toBe(
        fk.target_column,
      );
      expect(relation!.inverseEntityMetadata.tableName).toBe(fk.target_table);
      expect(relation!.isNullable).toBe(fk.nullable);
      expect(relation!.onDelete).toBe(fk.on_delete);
      expect(relation!.relationType).toBe(
        fk.unique_fk ? 'one-to-one' : 'many-to-one',
      );
      expect(relation!.inverseRelation?.inverseRelation).toBe(relation);
    }
    for (const metadata of source.entityMetadatas) {
      for (const relation of metadata.relations) {
        expect(relation.isEager).toBe(false);
        expect(relation.isLazy).toBe(false);
        expect(
          relation.isCascadeInsert ||
            relation.isCascadeUpdate ||
            relation.isCascadeRemove ||
            relation.isCascadeSoftRemove ||
            relation.isCascadeRecover,
        ).toBe(false);
      }
    }
    // actor_id is polymorphic historical evidence, not a users FK.
    expect(
      source
        .getMetadata(DeliveryStatusHistory)
        .relations.map((rel) => rel.propertyName),
    ).toEqual(['delivery']);
  });
});
