import { request as httpRequest } from 'node:http';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { AddDeliveryEvidenceAndCompletion1700000000018 } from '../src/database/migrations/1700000000018-AddDeliveryEvidenceAndCompletion';
import { createS3Storage } from './helpers/s3-storage';
import sharp from 'sharp';
import { PutObjectCommand } from '@aws-sdk/client-s3';
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
  AddDeliveryEvidenceAndCompletion1700000000018,
];

describe('C07/D01 commercial lifecycle through the compiled API and real PostgreSQL', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let child: ReturnType<typeof spawn> | undefined;
  let exited: Promise<unknown> | undefined;
  let baseUrl: string;
  let storage: Awaited<ReturnType<typeof createS3Storage>>;
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
    storage = await createS3Storage();
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
    if (storage) await storage.close();
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
        POD_S3_BUCKET: storage.bucket,
        POD_S3_REGION: 'us-east-1',
        POD_S3_ENDPOINT: storage.endpoint,
        AWS_ACCESS_KEY_ID: storage.accessKeyId,
        AWS_SECRET_ACCESS_KEY: storage.secretAccessKey,
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
    newPolicy = false,
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
    // Reconstruct the prior-policy fixture for C07/D01 historical regressions.
    // D02 cases keep the public creation policy and exercise the current journey.
    if (!newPolicy)
      await database.dataSource.query(
        `UPDATE deliveries SET "feeBreakdown" = "feeBreakdown" - 'recognitionPolicy' WHERE id = $1`,
        [response.body.id],
      );
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
        (m) =>
          m !== EnforceMethodCollectableAmount1700000000017 &&
          m !== AddDeliveryEvidenceAndCompletion1700000000018,
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
      const evidenceMigration =
        new AddDeliveryEvidenceAndCompletion1700000000018();
      for (const direction of ['up', 'down', 'up', 'down'] as const) {
        await source.transaction(
          async (manager) =>
            await evidenceMigration[direction](manager.queryRunner!),
        );
        expect(await repo.findOneByOrFail({ id: original.id })).toEqual(
          original,
        );
        expect(await repo.findOneByOrFail({ id: prepaid.id })).toEqual(prepaid);
      }
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
            AddDeliveryEvidenceAndCompletion1700000000018,
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
    const [currentGroupRule] = await source.query(
      "SELECT pg_get_functiondef('validate_ledger_event_complete()'::regprocedure) definition",
    );
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
    await source.query(currentGroupRule.definition);
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
  async function newJourney(
    method = 'cod',
    codAmount = '10000',
    businessId?: string,
  ) {
    const created = await freshDelivery(
      businessId,
      method,
      codAmount,
      undefined,
      true,
    );
    const driver = await freshDriver();
    const email = `d02-${randomUUID()}@example.test`;
    await database.dataSource
      .getRepository(User)
      .update(driver.user.id, { email, passwordHash: await hash(password) });
    const token = await login(email);
    const state = (await assign(created, driver.profile.id).expect(200)).body;
    return { state, driver, token };
  }
  function action(
    state: { id: string; version: number },
    token: string,
    toStatus: string,
    extra = {},
    key?: string,
  ) {
    const call = request(baseUrl)
      .post(`/deliveries/${state.id}/actions`)
      .auth(token, { type: 'bearer' })
      .send({ toStatus, expectedVersion: state.version, ...extra });
    if (key) call.set('Idempotency-Key', key);
    return call;
  }
  function payment(
    state: { id: string; version: number },
    token: string,
    amount: string,
    receiptId = randomUUID(),
  ) {
    return request(baseUrl)
      .post(`/deliveries/${state.id}/payments`)
      .auth(token, { type: 'bearer' })
      .send({ receiptId, amount, expectedVersion: state.version });
  }
  async function arrive(state: { id: string; version: number }, token: string) {
    let current = state;
    for (const to of ['ACCEPTED', 'PICKED_UP', 'IN_TRANSIT', 'ARRIVED'])
      current = (await action(current, token, to).expect(200)).body;
    return current;
  }
  async function photo(
    state: { id: string; version: number },
    token: string,
    bytes?: Uint8Array,
  ) {
    const uploadId = randomUUID();
    const upload = (
      await request(baseUrl)
        .post(`/deliveries/${state.id}/pod-uploads`)
        .auth(token, { type: 'bearer' })
        .send({
          uploadId,
          expectedVersion: state.version,
          contentType: 'image/png',
        })
        .expect(200)
    ).body;
    const png =
      bytes ??
      (await sharp({
        create: { width: 2, height: 2, channels: 3, background: '#336699' },
      })
        .png()
        .toBuffer());
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.fields))
      form.append(key, value as string);
    form.append(
      'file',
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      'pod.png',
    );
    expect(
      (await fetch(upload.url, { method: 'POST', body: form })).status,
    ).toBe(204);
    return { uploadId, upload, png };
  }

  it('D02 separates partial cash, physical DELIVERED and final COMPLETED with immutable versioned real-storage POD', async () => {
    const journey = await newJourney();
    const { token, driver } = journey;
    let state = journey.state;
    expect(
      await database.dataSource
        .getRepository(LedgerEntry)
        .countBy({ deliveryId: state.id }),
    ).toBe(0);
    const receiptId = randomUUID();
    const initial = state;
    const paid = await Promise.all(
      Array.from({ length: 8 }, () =>
        payment(initial, token, '6000', receiptId),
      ),
    );
    expect(
      paid.map((r) => r.status),
      runtimeErrors + JSON.stringify(paid[0].body),
    ).toEqual(Array(8).fill(200));
    state = paid[0].body;
    expect(state.status).toBe('ASSIGNED');
    expect(new Date(state.updatedAt).toISOString()).toBe(
      (
        await database.dataSource
          .getRepository(Delivery)
          .findOneByOrFail({ id: state.id })
      ).updatedAt.toISOString(),
    );
    expect(
      (
        await database.dataSource.query(
          'SELECT amount,"principalAmount","feeAmount" FROM delivery_payments WHERE id=$1',
          [receiptId],
        )
      )[0],
    ).toMatchObject({
      amount: '6000',
      principalAmount: '6000',
      feeAmount: '0',
    });
    await payment(initial, token, '6001', receiptId).expect(409);
    await payment(initial, token, '1').expect(409);
    state = await arrive(state, token);
    await action(state, token, 'DELIVERED').expect(400);
    const { uploadId, upload, png } = await photo(state, token);
    const objectKey = upload.fields.key as string;
    expect(
      (await fetch(`${storage.endpoint}/${storage.bucket}/${objectKey}`))
        .status,
    ).toBe(403);
    state = (
      await action(
        state,
        token,
        'DELIVERED',
        { uploadId },
        randomUUID(),
      ).expect(200)
    ).body;
    expect(state.status).toBe('DELIVERED');
    expect(state.deliveredAt).toBeTruthy();
    expect(
      await database.dataSource
        .getRepository(LedgerEntry)
        .countBy({ deliveryId: state.id, entryType: 'DRIVER_EARNING' }),
    ).toBe(0);
    expect(
      await database.dataSource
        .getRepository(DriverProfile)
        .findOneBy({ id: driver.profile.id }),
    ).toMatchObject({ availability: 'online' });
    const summary = (
      await request(baseUrl)
        .get(`/deliveries/${state.id}/payment-summary`)
        .auth(token, { type: 'bearer' })
        .expect(200)
    ).body;
    expect(summary).toEqual({
      expectedAmount: '10500',
      paidAmount: '6000',
      outstandingAmount: '4500',
    });
    const source = database.dataSource;
    const [proof] = await source.query(
      'SELECT * FROM proofs_of_delivery WHERE "deliveryId"=$1',
      [state.id],
    );
    await storage.client.send(
      new PutObjectCommand({
        Bucket: storage.bucket,
        Key: objectKey,
        ContentType: 'image/png',
        Body: await sharp({
          create: { width: 3, height: 3, channels: 3, background: '#ff0000' },
        })
          .png()
          .toBuffer(),
      }),
    );
    const link = (
      await request(baseUrl)
        .get(`/deliveries/${state.id}/proof`)
        .auth(token, { type: 'bearer' })
        .expect(200)
    ).body;
    expect(Buffer.from(await (await fetch(link.url)).arrayBuffer())).toEqual(
      Buffer.from(png),
    );
    expect(proof.objectVersion).toBeTruthy();
    const shortLink = await getSignedUrl(
      storage.client,
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: objectKey,
        VersionId: proof.objectVersion,
      }),
      { expiresIn: 1 },
    );
    await setTimeout(1300);
    expect((await fetch(shortLink)).status).toBe(403);
    const newerJob = await freshDelivery(
      undefined,
      'cod',
      '10000',
      undefined,
      true,
    );
    await assign(newerJob, driver.profile.id).expect(200);
    const lastId = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 8 }, () => payment(state, token, '4500', lastId)),
    );
    expect(
      responses.map((r) => r.status),
      runtimeErrors + JSON.stringify(responses[0].body),
    ).toEqual(Array(8).fill(200));
    const completed = responses[0].body;
    expect(completed.status).toBe('COMPLETED');
    expect(
      await source
        .getRepository(DriverProfile)
        .findOneBy({ id: driver.profile.id }),
    ).toMatchObject({ availability: 'on_delivery' });
    expect(
      await source
        .getRepository(AuditLog)
        .countBy({ entityId: state.id, action: 'delivery.payment' }),
    ).toBe(2);
    expect(
      (
        await source.query(
          'SELECT "principalAmount","feeAmount" FROM delivery_payments WHERE id=$1',
          [lastId],
        )
      )[0],
    ).toMatchObject({ principalAmount: '4000', feeAmount: '500' });
    expect(
      await source
        .getRepository(LedgerEvent)
        .countBy({ kind: 'completion', sourceId: state.id }),
    ).toBe(1);
    const entries = await source
      .getRepository(LedgerEntry)
      .find({ where: { deliveryId: state.id }, take: 20 });
    expect(
      entries
        .filter((e) => e.entryType === 'DRIVER_EARNING')
        .map((e) => e.amount),
    ).toEqual(['400']);
    expect(
      entries
        .filter((e) => e.entryType === 'COD_PAYABLE')
        .map((e) => e.amount)
        .sort(),
    ).toEqual(['4000', '6000']);
    const versions = await source.getRepository(DeliveryStatusHistory).find({
      where: { deliveryId: state.id },
      take: 20,
      order: { occurredAt: 'ASC' },
    });
    expect(versions.filter((h) => h.toStatus === 'COMPLETED')).toHaveLength(1);
    await stopCompiledApp();
    await startCompiledApp();
    await payment(state, token, '4500', lastId).expect(200);
    await payment(completed, token, '1').expect(409);
    for (const table of [
      'delivery_payments',
      'proofs_of_delivery',
      'delivery_attempts',
      'pod_uploads',
    ])
      await expect(source.query(`TRUNCATE ${table} CASCADE`)).rejects.toThrow(
        'Ledger history is immutable',
      );
    await expect(
      source.query('UPDATE delivery_payments SET amount=amount WHERE id=$1', [
        lastId,
      ]),
    ).rejects.toThrow('Ledger history is immutable');
  });

  it('D02 accepts full prepayment without claiming delivery and completes only after physical POD, including zero cash methods', async () => {
    for (const method of ['cod', 'prepaid', 'account']) {
      const { state: initial, token } = await newJourney(method, '0');
      let state = initial;
      if (method === 'cod') {
        state = (await payment(state, token, '500').expect(200)).body;
        expect(state.status).toBe('ASSIGNED');
      } else await payment(state, token, '1').expect(400);
      state = await arrive(state, token);
      const { uploadId } = await photo(state, token);
      const complete = (
        await action(state, token, 'DELIVERED', { uploadId }).expect(200)
      ).body;
      expect(complete.status).toBe('COMPLETED');
      expect(
        await database.dataSource
          .getRepository(LedgerEntry)
          .countBy({ deliveryId: state.id, entryType: 'COD_COLLECTED' }),
      ).toBe(0);
      expect(
        await database.dataSource
          .getRepository(LedgerEvent)
          .countBy({ kind: 'completion', sourceId: state.id }),
      ).toBe(1);
    }
  });

  it('D02 preserves quotes across failed attempts/retry and requires return evidence without earning money', async () => {
    const { state: initial, token } = await newJourney();
    let state = initial;
    state = (await action(state, token, 'ACCEPTED').expect(200)).body;
    state = (await action(state, token, 'PICKED_UP').expect(200)).body;
    await action(state, token, 'FAILED').expect(400);
    await action(state, token, 'FAILED', { reasonCode: 'other' }).expect(400);
    const key = randomUUID();
    const failures = await Promise.all(
      Array.from({ length: 8 }, () =>
        action(state, token, 'FAILED', { reasonCode: 'not_answered' }, key),
      ),
    );
    expect(failures.map((r) => r.status)).toEqual(Array(8).fill(200));
    state = failures[0].body;
    expect(
      (
        await database.dataSource.query(
          'SELECT count(*)::int count FROM delivery_attempts WHERE "deliveryId"=$1',
          [state.id],
        )
      )[0].count,
    ).toBe(1);
    expect(
      await database.dataSource
        .getRepository(LedgerEntry)
        .countBy({ deliveryId: state.id }),
    ).toBe(0);
    state = (
      await request(baseUrl)
        .post(`/deliveries/${state.id}/transition`)
        .auth(adminToken, { type: 'bearer' })
        .send({
          toStatus: 'RESCHEDULED',
          expectedVersion: state.version,
          reason: 'recipient_requested',
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        })
        .expect(200)
    ).body;
    state = (await action(state, token, 'IN_TRANSIT').expect(200)).body;
    state = (
      await action(state, token, 'FAILED', { reasonCode: 'refused' }).expect(
        200,
      )
    ).body;
    await action(state, token, 'RETURNED', { returnConfirmed: false }).expect(
      400,
    );
    state = (
      await action(state, token, 'RETURNED', { returnConfirmed: true }).expect(
        200,
      )
    ).body;
    expect(state.status).toBe('RETURNED');
    expect(
      await database.dataSource
        .getRepository(LedgerEntry)
        .countBy({ deliveryId: state.id }),
    ).toBe(0);
    await payment(state, token, '100').expect(409);
  });

  it('D02 denies foreign actors, invalid/overpayments and rolls back receipt/ledger/audit changes atomically', async () => {
    const { state, token } = await newJourney();
    for (const foreign of [senderToken, supportToken]) {
      await action(state, foreign, 'ACCEPTED').expect(403);
      await payment(state, foreign, '100').expect(403);
      await request(baseUrl)
        .post(`/deliveries/${state.id}/pod-uploads`)
        .auth(foreign, { type: 'bearer' })
        .send({
          uploadId: randomUUID(),
          contentType: 'image/png',
          expectedVersion: state.version,
        })
        .expect(403);
    }
    await payment(state, token, '0').expect(400);
    await payment(state, token, '10501').expect(400);
    const source = database.dataSource;
    const receiptId = randomUUID();
    await source.query(
      `CREATE FUNCTION d02_audit_fail() RETURNS trigger AS $$ BEGIN IF NEW.action='delivery.payment' THEN RAISE EXCEPTION 'injected audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER d02_audit_fail BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION d02_audit_fail()`,
    );
    try {
      await payment(state, token, '100', receiptId).expect(500);
      expect(
        (
          await source.query(
            'SELECT count(*)::int count FROM delivery_payments WHERE id=$1',
            [receiptId],
          )
        )[0].count,
      ).toBe(0);
      expect(
        await source
          .getRepository(LedgerEvent)
          .countBy({ kind: 'receipt', sourceId: receiptId }),
      ).toBe(0);
      expect(
        (await source.getRepository(Delivery).findOneByOrFail({ id: state.id }))
          .version,
      ).toBe(state.version);
    } finally {
      await source.query(
        'DROP TRIGGER d02_audit_fail ON audit_logs; DROP FUNCTION d02_audit_fail()',
      );
    }
    const paid = (
      await payment(state, adminToken, '100', receiptId).expect(200)
    ).body;
    await request(baseUrl)
      .post(`/deliveries/${state.id}/cancel`)
      .auth(senderToken, { type: 'bearer' })
      .send({ expectedVersion: paid.version, reason: 'sender_request' })
      .expect(409);
    const first = await action(paid, token, 'ACCEPTED').expect(200);
    const next = (await action(first.body, token, 'PICKED_UP').expect(200))
      .body;
    const invalid = await photo(
      next,
      token,
      new TextEncoder().encode('not an image'),
    );
    let arrived = (await action(next, token, 'IN_TRANSIT').expect(200)).body;
    arrived = (await action(arrived, token, 'ARRIVED').expect(200)).body;
    await action(arrived, token, 'DELIVERED', {
      uploadId: invalid.uploadId,
    }).expect(400);
    expect(
      (
        await source.query(
          'SELECT count(*)::int count FROM proofs_of_delivery WHERE "deliveryId"=$1',
          [state.id],
        )
      )[0].count,
    ).toBe(0);
    const goodPhoto = await photo(arrived, token);
    const delivered = (
      await action(arrived, token, 'DELIVERED', {
        uploadId: goodPhoto.uploadId,
      }).expect(200)
    ).body;
    const finalReceipt = randomUUID();
    await source.query(
      `CREATE FUNCTION d02_final_audit_fail() RETURNS trigger AS $$ BEGIN IF NEW.action='delivery.payment' THEN RAISE EXCEPTION 'injected final audit failure'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE TRIGGER d02_final_audit_fail BEFORE INSERT ON audit_logs FOR EACH ROW EXECUTE FUNCTION d02_final_audit_fail()`,
    );
    try {
      await payment(delivered, token, '10400', finalReceipt).expect(500);
      expect(
        (await source.getRepository(Delivery).findOneByOrFail({ id: state.id }))
          .status,
      ).toBe('DELIVERED');
      expect(
        await source
          .getRepository(LedgerEvent)
          .countBy({ kind: 'completion', sourceId: state.id }),
      ).toBe(0);
      expect(
        (
          await source.query(
            'SELECT count(*)::int count FROM delivery_payments WHERE id=$1',
            [finalReceipt],
          )
        )[0].count,
      ).toBe(0);
    } finally {
      await source.query(
        'DROP TRIGGER d02_final_audit_fail ON audit_logs; DROP FUNCTION d02_final_audit_fail()',
      );
    }
    await source.query(
      `CREATE FUNCTION d02_deferred_fail() RETURNS trigger AS $$ BEGIN IF NEW.kind='completion' THEN RAISE EXCEPTION 'injected deferred completion failure' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql; CREATE CONSTRAINT TRIGGER d02_deferred_fail AFTER INSERT ON ledger_events DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION d02_deferred_fail()`,
    );
    try {
      await payment(delivered, token, '10400', finalReceipt).expect(400);
      expect(
        (await source.getRepository(Delivery).findOneByOrFail({ id: state.id }))
          .status,
      ).toBe('DELIVERED');
      expect(
        (
          await source.query(
            'SELECT count(*)::int count FROM delivery_payments WHERE id=$1',
            [finalReceipt],
          )
        )[0].count,
      ).toBe(0);
    } finally {
      await source.query(
        'DROP TRIGGER d02_deferred_fail ON ledger_events; DROP FUNCTION d02_deferred_fail()',
      );
    }
    expect(
      (await payment(delivered, token, '10400', finalReceipt).expect(200)).body
        .status,
    ).toBe('COMPLETED');
  });
  it('D02 completes business receipts with exact large integers, denies foreign tenants and honors suspension', async () => {
    const business = (
      await request(baseUrl)
        .post('/businesses')
        .auth(senderToken, { type: 'bearer' })
        .send({
          name: 'D02 sender business',
          slug: `d02-${randomUUID()}`,
          contactPhone: '+96171089999',
        })
        .expect(201)
    ).body;
    const foreign = await newJourney();
    await request(baseUrl)
      .post('/businesses')
      .auth(foreign.token, { type: 'bearer' })
      .send({
        name: 'Other tenant',
        slug: `d02-other-${randomUUID()}`,
        contactPhone: '+96171089998',
      })
      .expect(201);
    for (const method of ['cod', 'prepaid', 'account']) {
      const { state: initial, token } = await newJourney(
        method,
        '9007199254740993',
        business.id,
      );
      await request(baseUrl)
        .post(`/deliveries/${initial.id}/payments`)
        .send({
          receiptId: randomUUID(),
          amount: '1',
          expectedVersion: initial.version,
        })
        .expect(401);
      await payment(initial, foreign.token, '1').expect(403);
      for (const endpoint of [
        'payments',
        'attempts',
        'payment-summary',
        'proof',
      ])
        await request(baseUrl)
          .get(`/deliveries/${initial.id}/${endpoint}`)
          .auth(foreign.token, { type: 'bearer' })
          .expect(404);
      await database.dataSource
        .getRepository(Business)
        .update(business.id, { status: 'suspended' as Business['status'] });
      await payment(initial, adminToken, '1').expect(403);
      await action(initial, token, 'ACCEPTED').expect(403);
      await database.dataSource
        .getRepository(Business)
        .update(business.id, { status: 'active' as Business['status'] });
      const expected = (
        9007199254740993n + (method === 'cod' ? 500n : 0n)
      ).toString();
      let state = (await payment(initial, token, expected).expect(200)).body;
      expect(state.status).toBe('ASSIGNED');
      state = await arrive(state, token);
      const { uploadId } = await photo(state, token);
      state = (
        await action(state, token, 'DELIVERED', { uploadId }).expect(200)
      ).body;
      expect(state.status).toBe('COMPLETED');
      const payable = await database.dataSource
        .getRepository(LedgerEntry)
        .findOneByOrFail({ deliveryId: state.id, entryType: 'COD_PAYABLE' });
      expect(payable).toMatchObject({
        amount: '9007199254740993',
        beneficiaryType: 'business',
        beneficiaryBusinessId: business.id,
      });
      const listing = (
        await request(baseUrl)
          .get(`/deliveries/${state.id}/payments?take=1&skip=0`)
          .auth(senderToken, { type: 'bearer' })
          .expect(200)
      ).body;
      expect(listing.items).toHaveLength(1);
      await request(baseUrl)
        .get(`/deliveries/${state.id}/payments?take=101`)
        .auth(senderToken, { type: 'bearer' })
        .expect(400);
    }
  });

  it('D02 rejects competing overpayments, expired/missing/cross-delivery POD and preserves revoked ownership', async () => {
    const first = await newJourney();
    const { state: initial, token } = first;
    const race = await Promise.all([
      payment(initial, token, '7000'),
      payment(initial, token, '7000'),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    const paid = race.find((r) => r.status === 200)!.body;
    expect(
      (
        await database.dataSource.query(
          'SELECT sum(amount)::text amount FROM delivery_payments WHERE "deliveryId"=$1',
          [initial.id],
        )
      )[0].amount,
    ).toBe('7000');
    await request(baseUrl)
      .post(`/deliveries/${paid.id}/transition`)
      .auth(adminToken, { type: 'bearer' })
      .send({
        toStatus: 'CREATED',
        expectedVersion: paid.version,
        reason: 'reassign',
      })
      .expect(409);
    const revocable = await newJourney();
    const key = randomUUID();
    // Revocation is from ASSIGNED before driver acceptance; an old receipt/action identity grants no authority.
    const released = (
      await request(baseUrl)
        .post(`/deliveries/${revocable.state.id}/transition`)
        .auth(adminToken, { type: 'bearer' })
        .send({
          toStatus: 'CREATED',
          expectedVersion: revocable.state.version,
          reason: 'reassign',
        })
        .expect(200)
    ).body;
    await action(revocable.state, revocable.token, 'ACCEPTED', {}, key).expect(
      403,
    );
    const replacement = await freshDriver();
    await assign(released, replacement.profile.id).expect(200);
    expect(
      await database.dataSource
        .getRepository(LedgerEntry)
        .countBy({ deliveryId: released.id }),
    ).toBe(0);
    let arrived = await arrive(paid, token);
    const expiredId = randomUUID();
    await database.dataSource.query(
      'INSERT INTO pod_uploads (id,"deliveryId","driverId","objectKey","contentType","expiresAt") VALUES ($1,$2,$3,$4,$5,$6)',
      [
        expiredId,
        arrived.id,
        first.driver.profile.id,
        `pod/${arrived.id}/${expiredId}`,
        'image/png',
        new Date(Date.now() - 1000),
      ],
    );
    await action(arrived, token, 'DELIVERED', { uploadId: expiredId }).expect(
      400,
    );
    const missingId = randomUUID();
    await request(baseUrl)
      .post(`/deliveries/${arrived.id}/pod-uploads`)
      .auth(token, { type: 'bearer' })
      .send({
        uploadId: missingId,
        expectedVersion: arrived.version,
        contentType: 'image/png',
      })
      .expect(200);
    await action(arrived, token, 'DELIVERED', { uploadId: missingId }).expect(
      400,
    );
    const another = await newJourney();
    const otherArrived = await arrive(another.state, another.token);
    const otherProof = await photo(otherArrived, another.token);
    await action(arrived, token, 'DELIVERED', {
      uploadId: otherProof.uploadId,
    }).expect(400);
    const oversized = await request(baseUrl)
      .post(`/deliveries/${arrived.id}/pod-uploads`)
      .auth(token, { type: 'bearer' })
      .send({
        uploadId: randomUUID(),
        expectedVersion: arrived.version,
        contentType: 'image/png',
      })
      .expect(200);
    const form = new FormData();
    for (const [name, value] of Object.entries(oversized.body.fields))
      form.append(name, value as string);
    form.append(
      'file',
      new Blob([new Uint8Array(5242881)], { type: 'image/png' }),
      'too-large.png',
    );
    expect(
      (await fetch(oversized.body.url, { method: 'POST', body: form })).status,
    ).toBeGreaterThanOrEqual(400);
    const migration = new AddDeliveryEvidenceAndCompletion1700000000018();
    await expect(
      database.dataSource.transaction(
        async (manager) => await migration.down(manager.queryRunner!),
      ),
    ).rejects.toThrow('preserve immutable records');
  });

  it('D02 serializes final cash against physical POD handover and converges to one completion', async () => {
    const journey = await newJourney();
    const { token } = journey;
    const paid = (await payment(journey.state, token, '6000').expect(200)).body;
    const arrived = await arrive(paid, token);
    const { uploadId } = await photo(arrived, token);
    const receiptId = randomUUID();
    const race = await Promise.all([
      payment(arrived, token, '4500', receiptId),
      action(arrived, token, 'DELIVERED', { uploadId }),
    ]);
    expect(race.map((r) => r.status).sort()).toEqual([200, 409]);
    let current = (
      await request(baseUrl)
        .get(`/deliveries/${arrived.id}`)
        .auth(token, { type: 'bearer' })
        .expect(200)
    ).body;
    if (current.status === 'ARRIVED') {
      current = (
        await action(current, token, 'DELIVERED', { uploadId }).expect(200)
      ).body;
    } else {
      expect(current.status).toBe('DELIVERED');
      current = (await payment(current, token, '4500', receiptId).expect(200))
        .body;
    }
    expect(current.status).toBe('COMPLETED');
    expect(
      (
        await request(baseUrl)
          .get(`/deliveries/${current.id}/payment-summary`)
          .auth(token, { type: 'bearer' })
          .expect(200)
      ).body,
    ).toEqual({
      expectedAmount: '10500',
      paidAmount: '10500',
      outstandingAmount: '0',
    });
    expect(
      (
        await request(baseUrl)
          .get(`/deliveries/${current.id}/payments?take=20&skip=0`)
          .auth(token, { type: 'bearer' })
          .expect(200)
      ).body.items,
    ).toHaveLength(2);
    expect(
      await database.dataSource
        .getRepository(LedgerEvent)
        .countBy({ kind: 'completion', sourceId: current.id }),
    ).toBe(1);
    expect(
      await database.dataSource
        .getRepository(LedgerEntry)
        .countBy({ deliveryId: current.id, entryType: 'DRIVER_EARNING' }),
    ).toBe(1);
  });

  it('D02 rejects stale unassignment and competing reassignment during physical completion', async () => {
    const { state, token, driver } = await newJourney();
    const arrived = await arrive(state, token);
    const { uploadId } = await photo(arrived, token);
    const replacement = await freshDriver();
    const [handover, unassign, reassign] = await Promise.all([
      action(arrived, token, 'DELIVERED', { uploadId }),
      request(baseUrl)
        .post(`/deliveries/${state.id}/transition`)
        .auth(adminToken, { type: 'bearer' })
        .send({
          toStatus: 'CREATED',
          expectedVersion: state.version,
          reason: 'reassign',
        }),
      assign(arrived, replacement.profile.id),
    ]);
    expect(handover.status).toBe(200);
    expect(unassign.status).toBe(409);
    expect(reassign.status).toBe(409);
    expect(handover.body).toMatchObject({
      status: 'DELIVERED',
      driverId: driver.profile.id,
    });
    const completed = (await payment(handover.body, token, '10500').expect(200))
      .body;
    expect(completed).toMatchObject({
      status: 'COMPLETED',
      driverId: driver.profile.id,
    });
    expect(
      await database.dataSource
        .getRepository(DeliveryFinancialSnapshot)
        .countBy({ deliveryId: state.id }),
    ).toBe(1);
    expect(
      await database.dataSource
        .getRepository(LedgerEvent)
        .countBy({ kind: 'completion', sourceId: state.id }),
    ).toBe(1);
    const earnings = await database.dataSource.getRepository(LedgerEntry).find({
      where: { deliveryId: state.id, entryType: 'DRIVER_EARNING' },
      take: 20,
    });
    expect(earnings).toHaveLength(1);
    expect(earnings[0]).toMatchObject({
      driverId: driver.profile.id,
      amount: '400',
    });
  });

  it('D02 rejects an interrupted storage transfer and reuses the same upload identity on retry', async () => {
    const { state, token } = await newJourney();
    const arrived = await arrive(state, token);
    const uploadId = randomUUID();
    const body = {
      uploadId,
      expectedVersion: arrived.version,
      contentType: 'image/png',
    };
    const createUpload = () =>
      request(baseUrl)
        .post(`/deliveries/${arrived.id}/pod-uploads`)
        .auth(token, { type: 'bearer' })
        .send(body);
    const upload = (await createUpload().expect(200)).body;
    const png = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();
    const form = new FormData();
    for (const [key, value] of Object.entries(upload.fields))
      form.append(key, value as string);
    form.append(
      'file',
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      'pod.png',
    );
    const encoded = new Request(upload.url, { method: 'POST', body: form });
    const bytes = Buffer.from(await encoded.arrayBuffer());
    await new Promise<void>((resolve, reject) => {
      const partial = httpRequest(upload.url, {
        method: 'POST',
        headers: {
          'Content-Type': encoded.headers.get('content-type')!,
          'Content-Length': String(bytes.length),
        },
      });
      partial.on('response', () =>
        reject(new Error('An incomplete upload unexpectedly completed')),
      );
      partial.on('error', (error) =>
        error.message === 'acceptance transfer interrupted'
          ? resolve()
          : reject(error),
      );
      partial.write(bytes.subarray(0, bytes.length - 16), () => {
        partial.destroy(new Error('acceptance transfer interrupted'));
      });
    });
    await action(arrived, token, 'DELIVERED', { uploadId }).expect(400);
    const retry = (await createUpload().expect(200)).body;
    expect(retry.uploadId).toBe(uploadId);
    expect(retry.fields.key).toBe(upload.fields.key);
    const retriedForm = new FormData();
    for (const [key, value] of Object.entries(retry.fields))
      retriedForm.append(key, value as string);
    retriedForm.append(
      'file',
      new Blob([new Uint8Array(png)], { type: 'image/png' }),
      'pod.png',
    );
    expect(
      (await fetch(retry.url, { method: 'POST', body: retriedForm })).status,
    ).toBe(204);
    expect(
      (await action(arrived, token, 'DELIVERED', { uploadId }).expect(200)).body
        .status,
    ).toBe('DELIVERED');
    expect(
      (
        await database.dataSource.query(
          'SELECT count(*)::int count FROM pod_uploads WHERE "deliveryId"=$1',
          [arrived.id],
        )
      )[0].count,
    ).toBe(1);
    expect(
      (
        await database.dataSource.query(
          'SELECT count(*)::int count FROM proofs_of_delivery WHERE "deliveryId"=$1',
          [arrived.id],
        )
      )[0].count,
    ).toBe(1);
    expect(
      await database.dataSource
        .getRepository(LedgerEntry)
        .countBy({ deliveryId: arrived.id }),
    ).toBe(0);
  });
});
