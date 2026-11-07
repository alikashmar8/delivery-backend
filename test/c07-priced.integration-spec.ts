import { AllowUnassignedEarningReplacement1700000000016 } from '../src/database/migrations/1700000000016-AllowUnassignedEarningReplacement';
import { EnforceMethodCollectableAmount1700000000017 } from '../src/database/migrations/1700000000017-EnforceMethodCollectableAmount';
import { IsNull } from 'typeorm';
import request from 'supertest';
import { DriverAvailability } from '../src/modules/users/entities/driver-profile.entity';
import { AddPricedSnapshots1700000000015 } from '../src/database/migrations/1700000000015-AddPricedSnapshots';
import { DeliveryFinancialSnapshot } from '../src/modules/finance/entities/delivery-financial-snapshot.entity';
import { AddImmutableLedger1700000000014 } from '../src/database/migrations/1700000000014-AddImmutableLedger';
import { LedgerEntry } from '../src/modules/finance/entities/ledger-entry.entity';
import { LedgerEvent } from '../src/modules/finance/entities/ledger-event.entity';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createServer } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { hash } from 'argon2';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
import { BusinessMember } from '../src/modules/businesses/entities/business-member.entity';
import { Business } from '../src/modules/businesses/entities/business.entity';
import { DeliveryAddress } from '../src/modules/deliveries/entities/delivery-address.entity';
import { DeliveryStatusHistory } from '../src/modules/deliveries/entities/delivery-status-history.entity';
import { Delivery } from '../src/modules/deliveries/entities/delivery.entity';
import { Recipient } from '../src/modules/deliveries/entities/recipient.entity';
import { IdempotencyKey } from '../src/modules/idempotency/entities/idempotency-key.entity';
import { PricingRule } from '../src/modules/pricing/entities/pricing-rule.entity';
import { Region } from '../src/modules/regions/entities/region.entity';
import {
  AdminRole,
  AdminRoleAssignment,
} from '../src/modules/users/entities/admin-role-assignment.entity';
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
  AllowUnassignedEarningReplacement1700000000016,
  EnforceMethodCollectableAmount1700000000017,
];

describe('C07/D01 commercial lifecycle through the compiled API and real PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let child: ReturnType<typeof spawn> | undefined;
  let exited: Promise<unknown> | undefined;
  let baseUrl: string;
  let runtimeErrors = '';
  const password = 'c07-test-password';
  let admin: User;
  let adminToken: string;
  let superToken: string;
  let sender: User;
  let senderToken: string;
  let supportToken: string;
  let planId: string;
  let phoneSequence = 100;

  beforeAll(async () => {
    database = await createPostgisDatabase(entities, migrations);
    const passwordHash = await hash(password);
    const users = database.dataSource.getRepository(User);
    [admin, sender] = await users.save([
      {
        phone: '+96171087001',
        email: 'c07-admin@example.test',
        passwordHash,
        displayName: 'Admin',
      },
      {
        phone: '+96171087002',
        email: 'c07-sender@example.test',
        passwordHash,
        displayName: 'Sender',
      },
    ]);
    const [superAdmin, support] = await users.save([
      {
        phone: '+96171087003',
        email: 'c07-super@example.test',
        passwordHash,
        displayName: 'Super',
      },
      {
        phone: '+96171087004',
        email: 'c07-support@example.test',
        passwordHash,
        displayName: 'Support',
      },
    ]);
    await database.dataSource.getRepository(AdminRoleAssignment).save([
      { userId: admin.id, role: AdminRole.ADMIN, active: true },
      { userId: superAdmin.id, role: AdminRole.SUPER_ADMIN, active: true },
      { userId: support.id, role: AdminRole.SUPPORT, active: true },
    ]);
    await startCompiledApp();
    [adminToken, senderToken, superToken, supportToken] = await Promise.all([
      login(admin.email!),
      login(sender.email!),
      login(superAdmin.email!),
      login(support.email!),
    ]);
    await request(baseUrl).get('/users/me').expect(401);
    await request(baseUrl)
      .get('/users/me')
      .auth(adminToken, { type: 'bearer' })
      .expect(200);
    const plan = await request(baseUrl)
      .post('/driver-compensation-plans')
      .auth(superToken, { type: 'bearer' })
      .send({
        name: 'C07 exact split',
        type: 'PER_DELIVERY',
        effectiveFrom: '2020-01-01T00:00:00Z',
        components: {
          deliveryAllocation: { platformFixedAmount: '100' },
          recurringCharge: { type: 'NONE', currency: 'USD' },
        },
      })
      .expect(201);
    planId = plan.body.id;
    await database.dataSource.getRepository(PricingRule).save({
      currency: 'USD',
      baseFee: '500',
      effectiveFrom: new Date('2020-01-01'),
    });
  });
  afterAll(async () => {
    await stopCompiledApp();
    if (database) await database.close();
  });
  async function allocatePort(): Promise<number> {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as AddressInfo).port;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    return port;
  }

  async function startCompiledApp(): Promise<void> {
    const connection = database.connection;
    const port = await allocatePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['dist/main.js'], {
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
        JWT_ACCESS_SECRET: 'c07-compiled-access-secret-value',
        JWT_REFRESH_SECRET: 'c07-compiled-refresh-secret-value',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout?.on('data', (chunk: Buffer) => {
      const value = chunk.toString();
      if (value.includes('"level":50')) runtimeErrors += value;
    });
    let startupError = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      startupError += chunk.toString();
      runtimeErrors += chunk.toString();
    });
    exited = once(child, 'exit');

    let response: Response | undefined;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect(child.exitCode, startupError).toBeNull();
      try {
        response = await fetch(`${baseUrl}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        break;
      } catch {
        await setTimeout(100);
      }
    }
    expect(response).toBeDefined();
    expect(response!.status).toBe(200);
    expect(await response!.json()).toMatchObject({
      status: 'ok',
      info: { database: { status: 'up' } },
    });
  }

  async function stopCompiledApp(): Promise<void> {
    if (!child || child.exitCode !== null) return;
    child.kill('SIGTERM');
    await Promise.race([exited, setTimeout(5000, undefined, { ref: false })]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await exited;
    }
    child = undefined;
    exited = undefined;
  }

  async function login(email: string): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/login/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(response.status).toBe(200);
    return ((await response.json()) as { accessToken: string }).accessToken;
  }

  async function freshDriver(
    options: { online?: boolean; assignedPlan?: boolean } = {},
  ) {
    const user = await database.dataSource.getRepository(User).save({
      phone: `+96171087${String(phoneSequence++).padStart(3, '0')}`,
      displayName: 'C07 driver',
    });
    const profile = await database.dataSource
      .getRepository(DriverProfile)
      .save({
        userId: user.id,
        active: true,
        availability:
          options.online === false
            ? DriverAvailability.OFFLINE
            : DriverAvailability.ONLINE,
        vehicleType: 'motorcycle',
      });
    if (options.assignedPlan !== false)
      await request(baseUrl)
        .post(`/drivers/${profile.id}/plan-assignments`)
        .auth(superToken, { type: 'bearer' })
        .send({ planId, effectiveFrom: '2020-01-01T00:00:00Z' })
        .expect(201);
    return { user, profile };
  }
  async function freshDelivery(
    businessId?: string,
    method = 'cod',
    codAmount = '10000',
    key?: string,
  ) {
    const response = await request(baseUrl)
      .post('/deliveries')
      .auth(senderToken, { type: 'bearer' })
      .set(key ? { 'Idempotency-Key': key } : {})
      .send({
        ...(businessId ? { businessId } : {}),
        currency: 'USD',
        codAmount,
        paymentMethod: method,
        pickupAddress: { city: 'Beirut', latitude: 33.9, longitude: 35.5 },
        recipient: {
          name: 'Recipient',
          phone: '+96171087999',
          city: 'Beirut',
          latitude: 33.9,
          longitude: 35.5,
        },
      })
      .expect(201);
    return response.body as {
      id: string;
      version: number;
      deliveryFee: string;
      collectableAmount: string;
    };
  }
  function assign(
    delivery: { id: string; version: number },
    driverId: string,
    token = adminToken,
    key?: string,
  ) {
    const call = request(baseUrl)
      .post(`/deliveries/${delivery.id}/assign`)
      .auth(token, { type: 'bearer' })
      .send({ driverId, expectedVersion: delivery.version });
    if (key) call.set('Idempotency-Key', key);
    return call;
  }

  it('D02 derives exact method-specific cash amounts with zero/large principal and concurrent creation replay', async () => {
    for (const method of ['cod', 'prepaid', 'account']) {
      for (const codAmount of ['0', '10000', '9007199254740993']) {
        const key = randomUUID();
        const expected = (
          BigInt(codAmount) + (method === 'cod' ? 500n : 0n)
        ).toString();
        const responses = await Promise.all(
          Array.from({ length: 4 }, () =>
            freshDelivery(undefined, method, codAmount, key),
          ),
        );
        const delivery = responses[0];
        for (const response of responses) {
          expect(response.id).toBe(delivery.id);
          expect(response.collectableAmount).toBe(expected);
        }
        expect(
          await database.dataSource.getRepository(Delivery).findOneByOrFail({
            id: delivery.id,
          }),
        ).toMatchObject({
          paymentMethod: method,
          codAmount,
          collectableAmount: expected,
        });
        expect(
          await database.dataSource
            .getRepository(DeliveryStatusHistory)
            .countBy({
              deliveryId: delivery.id,
            }),
        ).toBe(1);
        await expect(
          database.dataSource.query(
            'UPDATE deliveries SET "collectableAmount" = "collectableAmount" + 1 WHERE id = $1',
            [delivery.id],
          ),
        ).rejects.toMatchObject({ code: '23514' });
      }
    }
    const noCash = await freshDelivery(undefined, 'prepaid', '0');
    const { profile } = await freshDriver();
    await assign(noCash, profile.id).expect(200);
    expect(
      await database.dataSource.getRepository(LedgerEntry).countBy({
        deliveryId: noCash.id,
        entryType: 'COD_COLLECTED',
      }),
    ).toBe(0);
    const key = randomUUID();
    await freshDelivery(undefined, 'prepaid', '10000', key);
    await request(baseUrl)
      .post('/deliveries')
      .auth(senderToken, { type: 'bearer' })
      .set('Idempotency-Key', key)
      .send({
        currency: 'USD',
        codAmount: '10000',
        paymentMethod: 'account',
        pickupAddress: { city: 'Beirut', latitude: 33.9, longitude: 35.5 },
        recipient: {
          name: 'Recipient',
          phone: '+96171087999',
          city: 'Beirut',
          latitude: 33.9,
          longitude: 35.5,
        },
      })
      .expect(409);
  });

  it('D02 preserves populated rows across migration up/down and refuses incompatible history without repair', async () => {
    const prior = await createPostgisDatabase(
      entities,
      migrations.filter(
        (m) => m !== EnforceMethodCollectableAmount1700000000017,
      ),
    );
    try {
      const source = prior.dataSource;
      const user = await source.getRepository(User).save({
        phone: '+96171088100',
        displayName: 'D02 migration owner',
      });
      const repo = source.getRepository(Delivery);
      const original = await repo.save({
        trackingCode: randomUUID(),
        secureTrackingToken: randomUUID(),
        createdByUserId: user.id,
        currency: 'USD',
        codAmount: '10000',
        deliveryFee: '500',
        collectableAmount: '10500',
      });
      const migration = new EnforceMethodCollectableAmount1700000000017();
      for (const direction of ['up', 'down', 'up', 'down'] as const) {
        await source.transaction(async (manager) => {
          await migration[direction](manager.queryRunner!);
        });
        expect(await repo.findOneByOrFail({ id: original.id })).toEqual(
          original,
        );
        expect(
          (
            await source.query(`SELECT count(*)::int count FROM deliveries
          WHERE "collectableAmount" <> "codAmount"::numeric + "deliveryFee"::numeric`)
          )[0].count,
        ).toBe(0);
      }
      const legacy = await repo.save({
        trackingCode: randomUUID(),
        secureTrackingToken: randomUUID(),
        createdByUserId: user.id,
        currency: 'USD',
        paymentMethod: 'prepaid' as Delivery['paymentMethod'],
        codAmount: '10000',
        deliveryFee: '500',
        collectableAmount: '10500',
      });
      await expect(
        source.transaction(async (manager) => {
          await migration.up(manager.queryRunner!);
        }),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await repo.findOneByOrFail({ id: legacy.id })).toEqual(legacy);
      // Remove only this disposable, uncommitted test delivery to rehearse a clean upgrade.
      await repo.delete(legacy.id);
      await source.transaction(async (manager) => {
        await migration.up(manager.queryRunner!);
      });
      const prepaid = await repo.save({
        trackingCode: randomUUID(),
        secureTrackingToken: randomUUID(),
        createdByUserId: user.id,
        currency: 'USD',
        paymentMethod: 'prepaid' as Delivery['paymentMethod'],
        codAmount: '9223372036854775807',
        deliveryFee: '500',
        collectableAmount: '9223372036854775807',
      });
      expect(
        (
          await source.query(`SELECT count(*)::int count FROM deliveries
        WHERE "collectableAmount" <> CASE WHEN "paymentMethod" = 'cod'
        THEN "codAmount"::numeric + "deliveryFee"::numeric ELSE "codAmount"::numeric END`)
        )[0].count,
      ).toBe(0);
      await expect(
        source.transaction(async (manager) => {
          await migration.down(manager.queryRunner!);
        }),
      ).rejects.toMatchObject({ code: '23514' });
      expect(await repo.findOneByOrFail({ id: prepaid.id })).toEqual(prepaid);
      expect(await repo.findOneByOrFail({ id: original.id })).toEqual(original);
      await expect(
        source.query(
          'UPDATE deliveries SET "collectableAmount" = "codAmount" - 1 WHERE id = $1',
          [prepaid.id],
        ),
      ).rejects.toMatchObject({ code: '23514' });
    } finally {
      await prior.close();
    }
  });

  it('atomically commits one snapshot, posting set, capacity, version, history and safe audit under eight replays and restart', async () => {
    const delivery = await freshDelivery();
    const { profile } = await freshDriver();
    const key = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        assign(delivery, profile.id, adminToken, key),
      ),
    );
    for (const response of responses) {
      expect(response.status, JSON.stringify(response.body)).toBe(200);
      expect(response.body).toMatchObject({
        status: 'ASSIGNED',
        driverId: profile.id,
        version: 2,
      });
      expect(response.body.secureTrackingToken).toBeUndefined();
    }
    const source = database.dataSource;
    const snapshot = await source
      .getRepository(DeliveryFinancialSnapshot)
      .findOneByOrFail({ deliveryId: delivery.id });
    expect(snapshot).toMatchObject({
      customerDeliveryFee: '500',
      driverEarnings: '400',
      platformDeliveryRevenue: '100',
      driverCompensationPlanId: planId,
      currency: 'USD',
    });
    expect(
      await source
        .getRepository(DeliveryFinancialSnapshot)
        .countBy({ deliveryId: delivery.id }),
    ).toBe(1);
    const entries = await source
      .getRepository(LedgerEntry)
      .find({ where: { deliveryId: delivery.id }, take: 10 });
    expect(entries.map((e) => [e.entryType, e.amount]).sort()).toEqual([
      ['DELIVERY_FEE_CHARGED', '500'],
      ['DRIVER_EARNING', '400'],
      ['PLATFORM_DELIVERY_REVENUE', '100'],
    ]);
    expect(
      entries.find((entry) => entry.entryType === 'DELIVERY_FEE_CHARGED'),
    ).toMatchObject({
      beneficiaryType: 'user',
      beneficiaryUserId: sender.id,
      beneficiaryBusinessId: null,
      driverId: null,
    });
    expect(
      entries.find((entry) => entry.entryType === 'DRIVER_EARNING'),
    ).toMatchObject({
      beneficiaryUserId: profile.userId,
      driverId: profile.id,
    });
    expect(
      await source
        .getRepository(LedgerEvent)
        .countBy({ kind: 'priced', sourceId: delivery.id }),
    ).toBe(1);
    expect(
      await source
        .getRepository(DeliveryStatusHistory)
        .countBy({ deliveryId: delivery.id }),
    ).toBe(2);
    expect(
      await source
        .getRepository(AuditLog)
        .countBy({ entityId: delivery.id, action: 'delivery.assign' }),
    ).toBe(1);
    expect(
      await source.getRepository(DriverProfile).findOneBy({ id: profile.id }),
    ).toMatchObject({ availability: 'on_delivery', version: 2, balance: '0' });
    const audit = await source
      .getRepository(AuditLog)
      .findOneByOrFail({ entityId: delivery.id, action: 'delivery.assign' });
    expect(JSON.stringify(audit)).not.toMatch(
      /secureTrackingToken|passwordHash|license/,
    );
    await stopCompiledApp();
    await startCompiledApp();
    const replay = await assign(delivery, profile.id, adminToken, key).expect(
      200,
    );
    expect(replay.body.version).toBe(2);
    await assign(delivery, randomUUID(), adminToken, key).expect(409);
    expect(
      (
        await source
          .getRepository(DeliveryFinancialSnapshot)
          .findOneByOrFail({ deliveryId: delivery.id })
      ).id,
    ).toBe(snapshot.id);
    await source.getRepository(IdempotencyKey).delete({ idempotencyKey: key });
    await assign(delivery, profile.id, adminToken, key).expect(409);
    expect(
      await source
        .getRepository(LedgerEvent)
        .countBy({ kind: 'priced', sourceId: delivery.id }),
    ).toBe(1);
    const driverEmail = `c07-assigned-${randomUUID()}@example.test`;
    await source.getRepository(User).update(profile.userId, {
      email: driverEmail,
      passwordHash: await hash(password),
    });
    const driverToken = await login(driverEmail);
    const queue = await request(baseUrl)
      .get('/drivers/me/deliveries?take=10&skip=0')
      .auth(driverToken, { type: 'bearer' })
      .expect(200);
    expect(queue.body.items.map((item: { id: string }) => item.id)).toContain(
      delivery.id,
    );
    await request(baseUrl)
      .post('/drivers/me/availability')
      .auth(driverToken, { type: 'bearer' })
      .send({ availability: 'online', expectedVersion: 2 })
      .expect(409);
  });

  it('serializes competing delivery/driver assignments and DB-enforces single active capacity', async () => {
    const [one, two] = await Promise.all([freshDelivery(), freshDelivery()]);
    const { profile } = await freshDriver();
    const race = await Promise.all([
      assign(one, profile.id),
      assign(two, profile.id),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    const loser = race[0].status === 409 ? one : two;
    expect(
      await database.dataSource
        .getRepository(Delivery)
        .findOneBy({ id: loser.id }),
    ).toMatchObject({ driverId: null, status: 'CREATED', version: 1 });
    expect(
      await database.dataSource
        .getRepository(DeliveryFinancialSnapshot)
        .countBy({ deliveryId: loser.id }),
    ).toBe(0);
    await expect(
      database.dataSource.query(
        `UPDATE deliveries SET "driverId" = $1, status = 'ASSIGNED' WHERE id = $2`,
        [profile.id, loser.id],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    const free = await freshDelivery();
    const [d1, d2] = await Promise.all([freshDriver(), freshDriver()]);
    const sameDelivery = await Promise.all([
      assign(free, d1.profile.id),
      assign(free, d2.profile.id),
    ]);
    expect(sameDelivery.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it('rejects missing credentials, wrong roles, cross-tenant users, invalid payloads, stale versions and ineligible drivers', async () => {
    const delivery = await freshDelivery();
    const { profile } = await freshDriver();
    await request(baseUrl)
      .post(`/deliveries/${delivery.id}/assign`)
      .send({ driverId: profile.id, expectedVersion: 1 })
      .expect(401);
    for (const token of [senderToken, supportToken])
      await assign(delivery, profile.id, token).expect(403);
    for (const body of [
      { driverId: null, expectedVersion: 1 },
      { driverId: profile.id, expectedVersion: '1' },
      { driverId: profile.id, expectedVersion: 1, currency: 'LBP' },
    ])
      await request(baseUrl)
        .post(`/deliveries/${delivery.id}/assign`)
        .auth(adminToken, { type: 'bearer' })
        .send(body)
        .expect(400);
    await assign(delivery, profile.id, adminToken, 'invalid').expect(400);
    await assign({ ...delivery, version: 2 }, profile.id).expect(409);
    await assign(
      delivery,
      (await freshDriver({ online: false })).profile.id,
    ).expect(409);
    await assign(
      delivery,
      (await freshDriver({ assignedPlan: false })).profile.id,
    ).expect(409);
    const inactive = await freshDriver();
    await database.dataSource
      .getRepository(DriverProfile)
      .update(inactive.profile.id, {
        active: false,
        availability: DriverAvailability.OFFLINE,
      });
    await assign(delivery, inactive.profile.id).expect(409);
    const deleted = await freshDriver();
    await database.dataSource.getRepository(User).softDelete(deleted.user.id);
    await assign(delivery, deleted.profile.id).expect(409);
    const suspended = await freshDriver();
    await database.dataSource
      .getRepository(User)
      .update(suspended.user.id, { status: UserStatus.SUSPENDED });
    await assign(delivery, suspended.profile.id).expect(409);
    await assign(delivery, randomUUID()).expect(409);
    await assign(delivery, profile.id, superToken).expect(200);
  });

  it('rolls back operational and financial state when the final audit write fails, then retries cleanly', async () => {
    const delivery = await freshDelivery();
    const { profile } = await freshDriver();
    const key = randomUUID();
    const source = database.dataSource;
    await source.query(
      `CREATE FUNCTION c07_fail_audit() RETURNS trigger AS $$ BEGIN IF NEW.action = 'delivery.assign' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER c07_fail_audit BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION c07_fail_audit()`,
    );
    try {
      await assign(delivery, profile.id, adminToken, key).expect(500);
      expect(
        await source.getRepository(Delivery).findOneBy({ id: delivery.id }),
      ).toMatchObject({ status: 'CREATED', version: 1, driverId: null });
      expect(
        await source.getRepository(DriverProfile).findOneBy({ id: profile.id }),
      ).toMatchObject({ availability: 'online', version: 1 });
      expect(
        await source
          .getRepository(DeliveryFinancialSnapshot)
          .countBy({ deliveryId: delivery.id }),
      ).toBe(0);
      expect(
        await source
          .getRepository(LedgerEntry)
          .countBy({ deliveryId: delivery.id }),
      ).toBe(0);
      expect(
        await source
          .getRepository(DeliveryStatusHistory)
          .countBy({ deliveryId: delivery.id }),
      ).toBe(1);
      expect(
        await source
          .getRepository(IdempotencyKey)
          .countBy({ idempotencyKey: key }),
      ).toBe(0);
    } finally {
      await source.query(
        'DROP TRIGGER c07_fail_audit ON audit_logs; DROP FUNCTION c07_fail_audit()',
      );
    }
    await assign(delivery, profile.id, adminToken, key).expect(200);
  });
  it('keeps quoted pricing and committed plan terms after changes; future assignments use only the effective interval', async () => {
    const delivery = await freshDelivery();
    const { profile } = await freshDriver();
    const source = database.dataSource;
    const quote = await source
      .getRepository(Delivery)
      .findOneByOrFail({ id: delivery.id });
    await source
      .getRepository(PricingRule)
      .update(quote.pricingRuleId!, { baseFee: '900' });
    try {
      await assign(delivery, profile.id).expect(200);
      const snapshot = await source
        .getRepository(DeliveryFinancialSnapshot)
        .findOneByOrFail({ deliveryId: delivery.id });
      expect(snapshot).toMatchObject({
        customerDeliveryFee: '500',
        driverEarnings: '400',
        platformDeliveryRevenue: '100',
      });
      const next = await request(baseUrl)
        .post('/driver-compensation-plans')
        .auth(superToken, { type: 'bearer' })
        .send({
          name: 'New plan',
          type: 'PER_DELIVERY',
          effectiveFrom: '2020-01-01T00:00:00Z',
          components: {
            deliveryAllocation: { platformFixedAmount: '200' },
            recurringCharge: { type: 'NONE', currency: 'USD' },
          },
        })
        .expect(201);
      const boundary = new Date(Date.now() - 1000).toISOString();
      await request(baseUrl)
        .post(`/drivers/${profile.id}/plan-assignments`)
        .auth(superToken, { type: 'bearer' })
        .send({ planId: next.body.id, effectiveFrom: boundary })
        .expect(201);
      await request(baseUrl)
        .post(`/deliveries/${delivery.id}/transition`)
        .auth(adminToken, { type: 'bearer' })
        .send({ toStatus: 'CREATED', expectedVersion: 2, reason: 'unassign' })
        .expect(200);
      const cancelled = await request(baseUrl)
        .post(`/deliveries/${delivery.id}/cancel`)
        .auth(senderToken, { type: 'bearer' })
        .send({ expectedVersion: 3, reason: 'sender_request' });
      if (cancelled.status !== 201) await setTimeout(100);
      expect(cancelled.status, runtimeErrors).toBe(201);
      expect(
        await source
          .getRepository(DeliveryFinancialSnapshot)
          .findOneBy({ deliveryId: delivery.id }),
      ).toEqual(snapshot);
      const effects: { balance: string }[] = await source.query(
        `SELECT sum(CASE WHEN "entryType" = 'REVERSAL' THEN -amount ELSE amount END)::text balance FROM ledger_entries WHERE "deliveryId" = $1`,
        [delivery.id],
      );
      expect(effects[0].balance).toBe('0');
      const reversalCount = await source
        .getRepository(LedgerEntry)
        .countBy({ deliveryId: delivery.id, entryType: 'REVERSAL' });
      expect(reversalCount).toBe(3);
      const newDelivery = await freshDelivery();
      await assign(newDelivery, profile.id).expect(200);
      expect(
        await source
          .getRepository(DeliveryFinancialSnapshot)
          .findOneBy({ deliveryId: newDelivery.id }),
      ).toMatchObject({
        customerDeliveryFee: '900',
        driverEarnings: '700',
        platformDeliveryRevenue: '200',
        driverCompensationPlanId: next.body.id,
      });
    } finally {
      await source
        .getRepository(PricingRule)
        .update(quote.pricingRuleId!, { baseFee: '500' });
    }
    const futureDriver = await freshDriver({ assignedPlan: false });
    await request(baseUrl)
      .post(`/drivers/${futureDriver.profile.id}/plan-assignments`)
      .auth(superToken, { type: 'bearer' })
      .send({ planId, effectiveFrom: '2090-01-01T00:00:00Z' })
      .expect(201);
    await assign(await freshDelivery(), futureDriver.profile.id).expect(409);
    const expiredDriver = await freshDriver({ assignedPlan: false });
    await request(baseUrl)
      .post(`/drivers/${expiredDriver.profile.id}/plan-assignments`)
      .auth(superToken, { type: 'bearer' })
      .send({
        planId,
        effectiveFrom: '2020-01-01T00:00:00Z',
        effectiveTo: '2020-01-02T00:00:00Z',
      })
      .expect(201);
    await assign(await freshDelivery(), expiredDriver.profile.id).expect(409);
  });

  it('uses business ownership for all payment methods and denies foreign access and suspended-business mutation', async () => {
    const created = await request(baseUrl)
      .post('/businesses')
      .auth(senderToken, { type: 'bearer' })
      .send({
        name: 'C07 business',
        slug: `c07-${randomUUID()}`,
        contactPhone: '+96171087999',
      })
      .expect(201);
    const businessId = created.body.id as string;
    const source = database.dataSource;
    for (const method of ['cod', 'prepaid', 'account']) {
      const delivery = await freshDelivery(businessId, method);
      expect(delivery.collectableAmount).toBe(
        method === 'cod' ? '10500' : '10000',
      );
      const { profile } = await freshDriver();
      await assign(delivery, profile.id).expect(200);
      const fee = await source.getRepository(LedgerEntry).findOneByOrFail({
        deliveryId: delivery.id,
        entryType: 'DELIVERY_FEE_CHARGED',
      });
      expect(fee).toMatchObject({
        beneficiaryType: 'business',
        beneficiaryBusinessId: businessId,
        beneficiaryUserId: null,
        driverId: null,
      });
      const snapshot = await source
        .getRepository(DeliveryFinancialSnapshot)
        .findOneByOrFail({ deliveryId: delivery.id });
      expect(snapshot.eligibleFeeComponents.paymentMethod).toBe(method);
      expect(
        await source
          .getRepository(LedgerEntry)
          .countBy({ deliveryId: delivery.id, entryType: 'COD_PAYABLE' }),
      ).toBe(0);
      const outsider = await freshDriver();
      // No phone-derived or other-business access; admin scope is platform-wide by design.
      const outsiderEmail = `c07-outsider-${randomUUID()}@example.test`;
      await source.getRepository(User).update(outsider.user.id, {
        email: outsiderEmail,
        passwordHash: await hash(password),
      });
      const token = await login(outsiderEmail);
      await request(baseUrl)
        .get(`/deliveries/${delivery.id}`)
        .auth(token, { type: 'bearer' })
        .expect(404);
      await assign(delivery, outsider.profile.id, token).expect(403);
    }
    const suspendedDelivery = await freshDelivery(businessId);
    const driver = await freshDriver();
    await source
      .getRepository(Business)
      .update(businessId, { status: 'suspended' as Business['status'] });
    await assign(suspendedDelivery, driver.profile.id).expect(403);
    expect(
      await source
        .getRepository(DeliveryFinancialSnapshot)
        .countBy({ deliveryId: suspendedDelivery.id }),
    ).toBe(0);
  });

  it('rejects missing quote provenance, immutable-history mutations and a deferred commit failure without partial effects', async () => {
    const source = database.dataSource;
    const legacy = await freshDelivery();
    const available = await freshDriver();
    await source
      .getRepository(Delivery)
      .update(legacy.id, { feeBreakdown: null });
    legacy.version = (
      await source.getRepository(Delivery).findOneByOrFail({ id: legacy.id })
    ).version;
    await assign(legacy, available.profile.id).expect(400);
    expect(
      await source
        .getRepository(DriverProfile)
        .findOneBy({ id: available.profile.id }),
    ).toMatchObject({ availability: 'online', version: 1 });
    const delivery = await freshDelivery();
    await source.query(
      `CREATE FUNCTION c07_deferred_failure() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'injected deferred failure' USING ERRCODE = '23514'; END; $$ LANGUAGE plpgsql; CREATE CONSTRAINT TRIGGER c07_deferred_failure AFTER INSERT ON delivery_financial_snapshots DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION c07_deferred_failure()`,
    );
    try {
      await assign(delivery, available.profile.id).expect(400);
      expect(
        await source
          .getRepository(DeliveryFinancialSnapshot)
          .countBy({ deliveryId: delivery.id }),
      ).toBe(0);
      expect(
        await source
          .getRepository(LedgerEvent)
          .countBy({ kind: 'priced', sourceId: delivery.id }),
      ).toBe(0);
      expect(
        await source.getRepository(Delivery).findOneBy({ id: delivery.id }),
      ).toMatchObject({ status: 'CREATED', driverId: null, version: 1 });
    } finally {
      await source.query(
        'DROP TRIGGER c07_deferred_failure ON delivery_financial_snapshots; DROP FUNCTION c07_deferred_failure()',
      );
    }
    await assign(delivery, available.profile.id).expect(200);
    for (const sql of [
      'UPDATE delivery_financial_snapshots SET "driverEarnings" = "driverEarnings"',
      'DELETE FROM delivery_financial_snapshots',
      'TRUNCATE delivery_financial_snapshots',
    ])
      await expect(source.query(sql)).rejects.toThrow(
        'Financial snapshot is immutable',
      );
    await expect(
      source.query(
        `UPDATE deliveries SET "deliveryFee" = 501, "collectableAmount" = "codAmount" + 501 WHERE id = $1`,
        [delivery.id],
      ),
    ).rejects.toThrow('Committed delivery terms are immutable');
    const snapshot = await source
      .getRepository(DeliveryFinancialSnapshot)
      .findOneByOrFail({ deliveryId: delivery.id });
    await expect(
      source
        .getRepository(DeliveryFinancialSnapshot)
        .save({ ...snapshot, id: randomUUID() }),
    ).rejects.toMatchObject({ code: '23505' });
  });

  it('rehearses additive migration up/down/up on populated C06 data without changing prior history', async () => {
    const prior = await createPostgisDatabase(
      entities,
      migrations.filter(
        (m) =>
          ![
            AddPricedSnapshots1700000000015,
            AllowUnassignedEarningReplacement1700000000016,
            EnforceMethodCollectableAmount1700000000017,
          ].includes(m),
      ),
    );
    try {
      const source = prior.dataSource;
      const user = await source
        .getRepository(User)
        .save({ phone: '+96171087100', displayName: 'Existing C06 data' });
      const driver = await source
        .getRepository(DriverProfile)
        .save({ userId: user.id, vehicleType: 'motorcycle' });
      const history = await source.transaction(async (manager) => {
        const event = await manager.getRepository(LedgerEvent).save({
          kind: 'charge',
          sourceId: randomUUID(),
          payloadHash: 'a'.repeat(64),
          entryCount: 1,
          createdById: null,
          occurredAt: new Date(),
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
          createdById: null,
          occurredAt: event.occurredAt,
        });
        return { event, entry };
      });
      const migration = new AddPricedSnapshots1700000000015();
      for (const direction of ['up', 'down', 'up'] as const) {
        await source.transaction(async (manager) => {
          await migration[direction](manager.queryRunner!);
        });
        expect(
          await source.getRepository(User).findOneBy({ id: user.id }),
        ).toEqual(user);
        expect(
          await source
            .getRepository(LedgerEvent)
            .findOneBy({ id: history.event.id }),
        ).toEqual(history.event);
        expect(
          await source
            .getRepository(LedgerEntry)
            .findOneBy({ id: history.entry.id }),
        ).toEqual(history.entry);
      }
      expect(
        (
          await source.query(
            `SELECT count(*)::int count FROM pg_constraint WHERE conrelid = 'delivery_financial_snapshots'::regclass AND contype = 'f'`,
          )
        )[0].count,
      ).toBe(4);
    } finally {
      await prior.close();
    }
  });

  it('D01 upgrades populated C07 history up/down/up and rejects an unpaired replacement at the DB boundary', async () => {
    const source = database.dataSource;
    const delivery = await freshDelivery();
    const outgoing = await freshDriver();
    await assign(delivery, outgoing.profile.id).expect(200);
    const snapshot = await source
      .getRepository(DeliveryFinancialSnapshot)
      .findOneByOrFail({ deliveryId: delivery.id });
    const entries = await source.getRepository(LedgerEntry).find({
      where: { deliveryId: delivery.id },
      order: { id: 'ASC' },
      take: 10,
    });
    const migration = new AllowUnassignedEarningReplacement1700000000016();
    for (const direction of ['down', 'up', 'down', 'up'] as const) {
      await source.transaction(
        async (manager) => await migration[direction](manager.queryRunner!),
      );
      expect(
        await source
          .getRepository(DeliveryFinancialSnapshot)
          .findOneBy({ deliveryId: delivery.id }),
      ).toEqual(snapshot);
      expect(
        await source.getRepository(LedgerEntry).find({
          where: { deliveryId: delivery.id },
          order: { id: 'ASC' },
          take: 10,
        }),
      ).toEqual(entries);
    }
    const original = entries.find((e) => e.entryType === 'DRIVER_EARNING')!;
    const replacement = await freshDriver();
    await expect(
      source.transaction(async (manager) => {
        const event = await manager.getRepository(LedgerEvent).save({
          kind: 'reassignment',
          sourceId: original.id,
          payloadHash: 'a'.repeat(64),
          entryCount: 1,
          createdById: null,
          occurredAt: new Date(),
        });
        await manager.getRepository(LedgerEntry).save({
          eventId: event.id,
          eventIndex: 0,
          entryType: 'DRIVER_EARNING',
          amount: original.amount,
          currency: 'USD',
          deliveryId: delivery.id,
          driverId: replacement.profile.id,
          beneficiaryType: 'user',
          beneficiaryUserId: replacement.user.id,
          replacesEntryId: original.id,
          referenceType: 'adjustment',
          referenceId: original.id,
          createdById: null,
          occurredAt: event.occurredAt,
        });
      }),
    ).rejects.toMatchObject({ code: '23514' });
    expect(
      await source
        .getRepository(LedgerEntry)
        .countBy({ replacesEntryId: original.id }),
    ).toBe(0);
  });

  it('posts exact large amounts and omits each zero share, including a fully zero PRICED event', async () => {
    const source = database.dataSource;
    const rule = await source.getRepository(PricingRule).findOneOrFail({
      where: { businessId: IsNull() },
      order: { createdAt: 'ASC' },
    });
    for (const scenario of [
      {
        fee: '9007199254740993',
        fixed: '100',
        driver: '9007199254740893',
        revenue: '100',
        count: 3,
      },
      { fee: '500', fixed: '0', driver: '500', revenue: '0', count: 2 },
      { fee: '500', fixed: '500', driver: '0', revenue: '500', count: 2 },
      { fee: '0', fixed: '0', driver: '0', revenue: '0', count: 0 },
    ]) {
      const plan = await request(baseUrl)
        .post('/driver-compensation-plans')
        .auth(superToken, { type: 'bearer' })
        .send({
          name: 'C07 edge split',
          type: 'PER_DELIVERY',
          effectiveFrom: '2020-01-01T00:00:00Z',
          components: {
            deliveryAllocation: { platformFixedAmount: scenario.fixed },
            recurringCharge: { type: 'NONE', currency: 'USD' },
          },
        })
        .expect(201);
      const { profile } = await freshDriver({ assignedPlan: false });
      await request(baseUrl)
        .post(`/drivers/${profile.id}/plan-assignments`)
        .auth(superToken, { type: 'bearer' })
        .send({ planId: plan.body.id, effectiveFrom: '2020-01-01T00:00:00Z' })
        .expect(201);
      await source
        .getRepository(PricingRule)
        .update(rule.id, { baseFee: scenario.fee });
      try {
        const delivery = await freshDelivery();
        await assign(delivery, profile.id).expect(200);
        expect(
          await source
            .getRepository(DeliveryFinancialSnapshot)
            .findOneBy({ deliveryId: delivery.id }),
        ).toMatchObject({
          customerDeliveryFee: scenario.fee,
          driverEarnings: scenario.driver,
          platformDeliveryRevenue: scenario.revenue,
        });
        expect(
          await source
            .getRepository(LedgerEntry)
            .countBy({ deliveryId: delivery.id }),
        ).toBe(scenario.count);
        expect(
          await source
            .getRepository(LedgerEvent)
            .countBy({ kind: 'priced', sourceId: delivery.id }),
        ).toBe(1);
        const freed = (
          await transition({ id: delivery.id, version: 2 }).expect(200)
        ).body;
        const incoming = await freshDriver();
        const reassigned = await assign(freed, incoming.profile.id).expect(200);
        expect(await earningBalance(delivery.id, profile.id)).toBe('0');
        expect(await earningBalance(delivery.id, incoming.profile.id)).toBe(
          scenario.driver,
        );
        await transition(reassigned.body, 'CANCELLED').expect(200);
        expect(await earningBalance(delivery.id, incoming.profile.id)).toBe(
          '0',
        );
      } finally {
        await source
          .getRepository(PricingRule)
          .update(rule.id, { baseFee: '500' });
      }
    }
  });
  function transition(
    delivery: { id: string; version: number },
    toStatus = 'CREATED',
    token = adminToken,
    key?: string,
    extra: Record<string, unknown> = {},
  ) {
    const call = request(baseUrl)
      .post(`/deliveries/${delivery.id}/transition`)
      .auth(token, { type: 'bearer' })
      .send({
        toStatus,
        expectedVersion: delivery.version,
        reason: toStatus === 'CANCELLED' ? 'operational' : 'dispatch_change',
        ...extra,
      });
    if (key) call.set('Idempotency-Key', key);
    return call;
  }
  async function driverLogin(user: User) {
    const email = `d01-${randomUUID()}@example.test`;
    await database.dataSource
      .getRepository(User)
      .update(user.id, { email, passwordHash: await hash(password) });
    return await login(email);
  }
  async function earningBalance(deliveryId: string, driverId: string) {
    const rows: { balance: string }[] = await database.dataSource.query(
      `SELECT coalesce(sum(CASE WHEN "entryType" = 'DRIVER_EARNING' THEN amount::numeric WHEN "entryType" = 'REVERSAL' THEN -amount::numeric ELSE 0 END),0)::text balance FROM ledger_entries WHERE "deliveryId" = $1 AND "driverId" = $2`,
      [deliveryId, driverId],
    );
    return rows[0].balance;
  }

  it('D01 revokes ownership, reverses earning at unassignment, replays across restart and transfers only the locked amount through repeated cycles', async () => {
    const source = database.dataSource;
    const delivery = await freshDelivery();
    const original = await freshDriver();
    const replacement = await freshDriver();
    const driverToken = await driverLogin(original.user);
    const assigned = (await assign(delivery, original.profile.id).expect(200))
      .body;
    const snapshot = await source
      .getRepository(DeliveryFinancialSnapshot)
      .findOneByOrFail({ deliveryId: delivery.id });
    await request(baseUrl)
      .get(`/deliveries/${delivery.id}/details`)
      .auth(driverToken, { type: 'bearer' })
      .expect(200);
    const key = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        transition(assigned, 'CREATED', adminToken, key),
      ),
    );
    for (const result of results) {
      expect(result.status, JSON.stringify(result.body)).toBe(200);
      expect(result.body).toMatchObject({
        status: 'CREATED',
        driverId: null,
        version: 3,
      });
    }
    expect(await earningBalance(delivery.id, original.profile.id)).toBe('0');
    expect(
      await source
        .getRepository(DriverProfile)
        .findOneBy({ id: original.profile.id }),
    ).toMatchObject({ availability: 'online', version: 3 });
    for (const suffix of ['', '/details', '/history'])
      await request(baseUrl)
        .get(`/deliveries/${delivery.id}${suffix}`)
        .auth(driverToken, { type: 'bearer' })
        .expect(404);
    for (const path of [
      '/drivers/me/deliveries',
      `/deliveries?driverId=${original.profile.id}`,
    ]) {
      const queue = await request(baseUrl)
        .get(path)
        .auth(driverToken, { type: 'bearer' })
        .expect(200);
      expect(
        queue.body.items.map((item: { id: string }) => item.id),
      ).not.toContain(delivery.id);
    }
    expect(
      await source
        .getRepository(LedgerEntry)
        .countBy({ deliveryId: delivery.id, entryType: 'REVERSAL' }),
    ).toBe(1);
    expect(
      await source
        .getRepository(AuditLog)
        .countBy({ entityId: delivery.id, action: 'delivery.unassign' }),
    ).toBe(1);
    expect(
      await source
        .getRepository(DeliveryStatusHistory)
        .countBy({ deliveryId: delivery.id }),
    ).toBe(3);
    await stopCompiledApp();
    await startCompiledApp();
    await transition(assigned, 'CREATED', adminToken, key).expect(200);
    await transition(assigned, 'CREATED', adminToken, key, {
      reason: 'changed',
    }).expect(409);
    await source.getRepository(IdempotencyKey).delete({ idempotencyKey: key });
    await transition(assigned, 'CREATED', adminToken, key).expect(409);
    // A different currently effective replacement plan must not reprice an existing commitment.
    const newPlan = await request(baseUrl)
      .post('/driver-compensation-plans')
      .auth(superToken, { type: 'bearer' })
      .send({
        name: 'D01 different replacement terms',
        type: 'PER_DELIVERY',
        effectiveFrom: '2020-01-01T00:00:00Z',
        components: {
          deliveryAllocation: { platformFixedAmount: '300' },
          recurringCharge: { type: 'NONE', currency: 'USD' },
        },
      })
      .expect(201);
    await request(baseUrl)
      .post(`/drivers/${replacement.profile.id}/plan-assignments`)
      .auth(superToken, { type: 'bearer' })
      .send({
        planId: newPlan.body.id,
        effectiveFrom: new Date(Date.now() - 1000).toISOString(),
      })
      .expect(201);
    const replacementKey = randomUUID();
    const replaced = await Promise.all(
      Array.from({ length: 8 }, () =>
        assign(
          { id: delivery.id, version: 3 },
          replacement.profile.id,
          adminToken,
          replacementKey,
        ),
      ),
    );
    expect(replaced.map((r) => r.status)).toEqual(Array(8).fill(200));
    expect(await earningBalance(delivery.id, replacement.profile.id)).toBe(
      '400',
    );
    expect(
      await source
        .getRepository(DeliveryFinancialSnapshot)
        .findOneBy({ deliveryId: delivery.id }),
    ).toEqual(snapshot);
    expect(
      await source
        .getRepository(LedgerEvent)
        .countBy({ kind: 'priced', sourceId: delivery.id }),
    ).toBe(1);
    await expect(
      source.transaction(
        async (manager) =>
          await new AllowUnassignedEarningReplacement1700000000016().down(
            manager.queryRunner!,
          ),
      ),
    ).rejects.toThrow('Cannot revert split reassignment history');
    const originalEarning = await source
      .getRepository(LedgerEntry)
      .findOneByOrFail({
        deliveryId: delivery.id,
        entryType: 'DRIVER_EARNING',
        driverId: original.profile.id,
      });
    const replacementEarning = await source
      .getRepository(LedgerEntry)
      .findOneByOrFail({ replacesEntryId: originalEarning.id });
    expect(replacementEarning).toMatchObject({
      amount: '400',
      driverId: replacement.profile.id,
    });
    await stopCompiledApp();
    await startCompiledApp();
    await assign(
      { id: delivery.id, version: 3 },
      replacement.profile.id,
      adminToken,
      replacementKey,
    ).expect(200);
    await transition(replaced[0].body, 'CREATED', superToken).expect(200);
    const again = await assign(
      { id: delivery.id, version: 5 },
      original.profile.id,
    ).expect(200);
    expect(await earningBalance(delivery.id, replacement.profile.id)).toBe('0');
    expect(await earningBalance(delivery.id, original.profile.id)).toBe('400');
    await transition(again.body, 'CANCELLED').expect(200);
    expect(await earningBalance(delivery.id, original.profile.id)).toBe('0');
    const rows = await source.query(
      `SELECT sum(CASE WHEN "entryType" = 'REVERSAL' THEN -amount::numeric ELSE amount::numeric END)::text total FROM ledger_entries WHERE "deliveryId" = $1`,
      [delivery.id],
    );
    expect(rows[0].total).toBe('0');
    expect(
      await source
        .getRepository(DeliveryFinancialSnapshot)
        .findOneBy({ deliveryId: delivery.id }),
    ).toEqual(snapshot);
    await assign(
      { id: delivery.id, version: 7 },
      replacement.profile.id,
    ).expect(409);
  });

  it('D01 rolls back unassignment and replacement on history/audit/deferred failures, including replay keys, then retries', async () => {
    const source = database.dataSource;
    const delivery = await freshDelivery();
    const outgoing = await freshDriver();
    const assigned = (await assign(delivery, outgoing.profile.id).expect(200))
      .body;
    for (const boundary of ['history', 'audit', 'deferred']) {
      const key = randomUUID();
      const table =
        boundary === 'history'
          ? 'delivery_status_history'
          : boundary === 'audit'
            ? 'audit_logs'
            : 'ledger_events';
      const condition =
        boundary === 'history'
          ? `NEW."toStatus" = 'CREATED'`
          : boundary === 'audit'
            ? `NEW.action = 'delivery.unassign'`
            : `NEW.kind = 'reversal'`;
      await source.query(`CREATE FUNCTION d01_fail() RETURNS trigger AS $$ BEGIN IF ${condition} THEN RAISE EXCEPTION 'injected D01 failure' ${boundary === 'deferred' ? "USING ERRCODE = '23514'" : ''}; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql;
        CREATE ${boundary === 'deferred' ? 'CONSTRAINT ' : ''}TRIGGER d01_fail ${boundary === 'deferred' ? 'AFTER' : 'BEFORE'} INSERT ON ${table} ${boundary === 'deferred' ? 'DEFERRABLE INITIALLY DEFERRED' : ''} FOR EACH ROW EXECUTE FUNCTION d01_fail()`);
      try {
        await transition(assigned, 'CREATED', adminToken, key).expect(
          boundary === 'deferred' ? 400 : 500,
        );
        expect(
          await source.getRepository(Delivery).findOneBy({ id: delivery.id }),
        ).toMatchObject({
          status: 'ASSIGNED',
          driverId: outgoing.profile.id,
          version: 2,
        });
        expect(
          await source
            .getRepository(DriverProfile)
            .findOneBy({ id: outgoing.profile.id }),
        ).toMatchObject({ availability: 'on_delivery', version: 2 });
        expect(await earningBalance(delivery.id, outgoing.profile.id)).toBe(
          '400',
        );
        expect(
          await source
            .getRepository(LedgerEntry)
            .countBy({ deliveryId: delivery.id }),
        ).toBe(3);
        expect(
          await source
            .getRepository(DeliveryStatusHistory)
            .countBy({ deliveryId: delivery.id }),
        ).toBe(2);
        expect(
          await source
            .getRepository(IdempotencyKey)
            .countBy({ idempotencyKey: key }),
        ).toBe(0);
      } finally {
        await source.query(
          `DROP TRIGGER d01_fail ON ${table}; DROP FUNCTION d01_fail()`,
        );
      }
    }
    const unassigned = (await transition(assigned).expect(200)).body;
    const incoming = await freshDriver();
    const key = randomUUID();
    await source.query(
      `CREATE FUNCTION d01_fail() RETURNS trigger AS $$ BEGIN IF NEW.action = 'delivery.assign' THEN RAISE EXCEPTION 'injected replacement failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER d01_fail BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION d01_fail()`,
    );
    try {
      await assign(unassigned, incoming.profile.id, adminToken, key).expect(
        500,
      );
      expect(
        await source.getRepository(Delivery).findOneBy({ id: delivery.id }),
      ).toMatchObject({ status: 'CREATED', driverId: null, version: 3 });
      expect(
        await source
          .getRepository(DriverProfile)
          .findOneBy({ id: incoming.profile.id }),
      ).toMatchObject({ availability: 'online', version: 1 });
      expect(
        await source
          .getRepository(LedgerEntry)
          .countBy({ deliveryId: delivery.id }),
      ).toBe(4);
      expect(
        await source
          .getRepository(IdempotencyKey)
          .countBy({ idempotencyKey: key }),
      ).toBe(0);
    } finally {
      await source.query(
        'DROP TRIGGER d01_fail ON audit_logs; DROP FUNCTION d01_fail()',
      );
    }
    await assign(unassigned, incoming.profile.id, adminToken, key).expect(200);
  });

  it('D01 serializes unassign/cancel and competing replacements; stale retries cannot revoke later ownership', async () => {
    const delivery = await freshDelivery();
    const outgoing = await freshDriver();
    const assigned = (await assign(delivery, outgoing.profile.id).expect(200))
      .body;
    const race = await Promise.all([
      transition(assigned),
      transition(assigned, 'CANCELLED'),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    const another = await freshDelivery();
    const first = await freshDriver();
    const active = (await assign(another, first.profile.id).expect(200)).body;
    const freed = (await transition(active).expect(200)).body;
    const [a, b] = await Promise.all([freshDriver(), freshDriver()]);
    const competing = await Promise.all([
      assign(freed, a.profile.id),
      assign(freed, b.profile.id),
    ]);
    expect(competing.map((r) => r.status).sort()).toEqual([200, 409]);
    await transition(active).expect(409);
    expect(await earningBalance(another.id, first.profile.id)).toBe('0');
    expect(
      [
        await earningBalance(another.id, a.profile.id),
        await earningBalance(another.id, b.profile.id),
      ].sort(),
    ).toEqual(['0', '400']);
  });

  it('D01 enforces actor/tenant/state/evidence boundaries without exposing D02 driver completion', async () => {
    const source = database.dataSource;
    const delivery = await freshDelivery();
    const outgoing = await freshDriver();
    const token = await driverLogin(outgoing.user);
    const assigned = (await assign(delivery, outgoing.profile.id).expect(200))
      .body;
    await request(baseUrl)
      .post(`/deliveries/${delivery.id}/transition`)
      .send({
        toStatus: 'CREATED',
        expectedVersion: 2,
        reason: 'dispatch_change',
      })
      .expect(401);
    for (const denied of [senderToken, supportToken, token])
      await transition(assigned, 'CREATED', denied).expect(403);
    for (const status of [
      'ACCEPTED',
      'PICKED_UP',
      'DELIVERED',
      'RETURNED',
      'RESCHEDULED',
    ])
      await transition(assigned, status).expect(409);
    await transition(assigned, 'ASSIGNED').expect(400);
    await transition(assigned, 'CREATED', adminToken, undefined, {
      reason: ' ',
    }).expect(400);
    await transition(assigned, 'CANCELLED', adminToken, undefined, {
      reason: 'not_a_reason',
    }).expect(400);
    await transition(assigned, 'CREATED', adminToken, 'bad-key').expect(400);
    await transition(assigned, 'CREATED', adminToken, undefined, {
      expectedVersion: '2',
    }).expect(400);
    await source
      .getRepository(Delivery)
      .update(delivery.id, { status: 'ARRIVED' as Delivery['status'] });
    await transition(assigned, 'FAILED').expect(409);
    await source
      .getRepository(Delivery)
      .update(delivery.id, { status: 'FAILED' as Delivery['status'] });
    const failed = await source
      .getRepository(Delivery)
      .findOneByOrFail({ id: delivery.id });
    await transition(failed, 'RESCHEDULED', adminToken, undefined, {
      scheduledAt: null,
    }).expect(400);
    await transition(failed, 'RESCHEDULED', adminToken, undefined, {
      scheduledAt: 'invalid',
    }).expect(400);
    const scheduledAt = '2027-01-02T10:00:00Z';
    const scheduled = await transition(
      failed,
      'RESCHEDULED',
      superToken,
      undefined,
      { scheduledAt },
    ).expect(200);
    expect(scheduled.body.scheduledAt).toBe('2027-01-02T10:00:00.000Z');
    await transition(scheduled.body, 'CREATED').expect(409);
    await transition(scheduled.body, 'IN_TRANSIT').expect(200);
    const business = await request(baseUrl)
      .post('/businesses')
      .auth(senderToken, { type: 'bearer' })
      .send({
        name: 'D01 business',
        slug: `d01-${randomUUID()}`,
        contactPhone: '+96171087999',
      })
      .expect(201);
    const owned = await freshDelivery(business.body.id);
    const foreign = await driverLogin((await freshDriver()).user);
    await request(baseUrl)
      .post(`/deliveries/${owned.id}/cancel`)
      .auth(foreign, { type: 'bearer' })
      .send({ expectedVersion: 1, reason: 'sender_request' })
      .expect(403);
    const businessDriver = await freshDriver();
    const businessAssigned = (
      await assign(owned, businessDriver.profile.id).expect(200)
    ).body;
    await source
      .getRepository(Business)
      .update(business.body.id, { status: 'suspended' as Business['status'] });
    await transition(businessAssigned).expect(403);

    await request(baseUrl)
      .post(`/deliveries/${owned.id}/cancel`)
      .auth(senderToken, { type: 'bearer' })
      .send({ expectedVersion: 1, reason: 'sender_request' })
      .expect(403);
    const legacy = await freshDelivery();
    await source.getRepository(Delivery).update(legacy.id, {
      status: 'ASSIGNED' as Delivery['status'],
      driverId: (await freshDriver()).profile.id,
    });
    const legacyAssigned = await source
      .getRepository(Delivery)
      .findOneByOrFail({ id: legacy.id });
    const legacyUnassigned = await transition(legacyAssigned).expect(200);
    expect(legacyUnassigned.body.driverId).toBeNull();
    const noDriver = await freshDelivery();
    await source
      .getRepository(Delivery)
      .update(noDriver.id, { status: 'RESCHEDULED' as Delivery['status'] });
    await transition(
      await source.getRepository(Delivery).findOneByOrFail({ id: noDriver.id }),
      'IN_TRANSIT',
    ).expect(400);
  });

  it('D01 retains online/effective-plan/capacity eligibility for replacements and keeps deactivated outgoing drivers offline', async () => {
    const delivery = await freshDelivery();
    const original = await freshDriver();
    const assigned = (await assign(delivery, original.profile.id).expect(200))
      .body;
    await request(baseUrl)
      .patch(`/drivers/${original.profile.id}/activation`)
      .auth(adminToken, { type: 'bearer' })
      .send({ active: false, expectedVersion: 2 })
      .expect(200);
    const unassigned = (await transition(assigned).expect(200)).body;
    expect(
      await database.dataSource
        .getRepository(DriverProfile)
        .findOneBy({ id: original.profile.id }),
    ).toMatchObject({ active: false, availability: 'offline' });
    await assign(unassigned, original.profile.id).expect(409);
    for (const options of [{ online: false }, { assignedPlan: false }])
      await assign(unassigned, (await freshDriver(options)).profile.id).expect(
        409,
      );
    const busy = await freshDriver();
    await assign(await freshDelivery(), busy.profile.id).expect(200);
    await assign(unassigned, busy.profile.id).expect(409);
    const eligible = await freshDriver();
    await assign(unassigned, eligible.profile.id).expect(200);
    const cancelKey = randomUUID();
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(baseUrl)
          .post(`/deliveries/${delivery.id}/cancel`)
          .auth(senderToken, { type: 'bearer' })
          .set('Idempotency-Key', cancelKey)
          .send({ expectedVersion: 4, reason: 'sender_request' }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(201));
    expect(await earningBalance(delivery.id, eligible.profile.id)).toBe('0');
    expect(
      await database.dataSource
        .getRepository(DeliveryStatusHistory)
        .countBy({ deliveryId: delivery.id }),
    ).toBe(5);
    await stopCompiledApp();
    await startCompiledApp();
    await request(baseUrl)
      .post(`/deliveries/${delivery.id}/cancel`)
      .auth(senderToken, { type: 'bearer' })
      .set('Idempotency-Key', cancelKey)
      .send({ expectedVersion: 4, reason: 'sender_request' })
      .expect(201);
  });
});
