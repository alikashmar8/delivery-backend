import { AddPricedSnapshots1700000000015 } from '../src/database/migrations/1700000000015-AddPricedSnapshots';
import { DeliveryFinancialSnapshot } from '../src/modules/finance/entities/delivery-financial-snapshot.entity';
import { AddImmutableLedger1700000000014 } from '../src/database/migrations/1700000000014-AddImmutableLedger';
import { LedgerEntry } from '../src/modules/finance/entities/ledger-entry.entity';
import { LedgerEvent } from '../src/modules/finance/entities/ledger-event.entity';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
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
];

describe('C04 driver capability through the compiled entrypoint', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let child: ReturnType<typeof spawn> | undefined;
  let exited: Promise<unknown> | undefined;
  let baseUrl: string;
  const password = 'c04-compiled-password';
  const adminEmail = `c04-compiled-admin-${randomUUID()}@example.test`;
  const driverEmail = `c04-compiled-driver-${randomUUID()}@example.test`;
  let driverUserId: string;

  beforeAll(async () => {
    database = await createPostgisDatabase(entities, migrations);
    const users = database.dataSource.getRepository(User);
    const admin = await users.save({
      phone: '+96171081001',
      email: adminEmail,
      displayName: 'C04 compiled admin',
      passwordHash: await hash(password),
    });
    const driver = await users.save({
      phone: '+96171081002',
      email: driverEmail,
      displayName: 'C04 compiled driver',
      passwordHash: await hash(password),
    });
    driverUserId = driver.id;
    await database.dataSource.getRepository(AdminRoleAssignment).save({
      userId: admin.id,
      role: AdminRole.ADMIN,
      active: true,
      grantedById: admin.id,
    });
    await startCompiledApp();
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
        JWT_ACCESS_SECRET: 'c04-compiled-access-secret-value',
        JWT_REFRESH_SECRET: 'c04-compiled-refresh-secret-value',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let startupError = '';
    child.stderr?.on('data', (chunk: Buffer) => {
      startupError += chunk.toString();
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

  it('enforces the compiled approval and availability contract', async () => {
    const denied = await fetch(`${baseUrl}/drivers`);
    expect(denied.status).toBe(401);

    const adminToken = await login(adminEmail);
    const onboard = await fetch(
      `${baseUrl}/users/${driverUserId}/driver-profile`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 'c04-compiled-admin-client/1.0',
        },
        body: JSON.stringify({
          vehicleType: 'motorcycle',
          vehiclePlate: 'C04-COMPILED',
          license: 'c04-compiled-private-license',
        }),
      },
    );
    expect(onboard.status).toBe(201);
    const profile = (await onboard.json()) as {
      id: string;
      active: boolean;
      availability: string;
      version: number;
      license?: string;
    };
    expect(profile).toMatchObject({
      active: false,
      availability: 'offline',
      version: 1,
    });
    expect(profile.license).toBeUndefined();

    const driverToken = await login(driverEmail);
    const pendingAvailability = await fetch(
      `${baseUrl}/drivers/me/availability`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${driverToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ availability: 'online', expectedVersion: 1 }),
      },
    );
    expect(pendingAvailability.status).toBe(403);

    const approval = await fetch(
      `${baseUrl}/drivers/${profile.id}/activation`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          active: true,
          expectedVersion: profile.version,
        }),
      },
    );
    expect(approval.status).toBe(200);
    const approved = (await approval.json()) as { version: number };

    const availability = await fetch(`${baseUrl}/drivers/me/availability`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${driverToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        availability: 'online',
        expectedVersion: approved.version,
      }),
    });
    expect(availability.status).toBe(200);
    expect(await availability.json()).toMatchObject({
      active: true,
      availability: 'online',
      changed: true,
    });

    const audit = await database.dataSource
      .getRepository(AuditLog)
      .findOneByOrFail({ action: 'driver.onboard', entityId: profile.id });
    expect(audit.userAgent).toBe('c04-compiled-admin-client/1.0');
    expect(JSON.stringify(audit)).not.toContain('c04-compiled-private-license');
  });

  it('enforces C05 compensation roles, USD terms, and non-overlapping assignment periods', async () => {
    const unauthenticated = await fetch(`${baseUrl}/driver-compensation-plans`);
    expect(unauthenticated.status).toBe(401);

    const adminToken = await login(adminEmail);
    const adminRead = await fetch(`${baseUrl}/driver-compensation-plans`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(adminRead.status).toBe(200);

    const driverToken = await login(driverEmail);
    const driverRead = await fetch(`${baseUrl}/driver-compensation-plans`, {
      headers: { Authorization: `Bearer ${driverToken}` },
    });
    expect(driverRead.status).toBe(403);

    const superUser = await database.dataSource.getRepository(User).save({
      phone: '+96171081003',
      email: `c05-super-${randomUUID()}@example.test`,
      displayName: 'C05 super admin',
      passwordHash: await hash(password),
    });
    await database.dataSource.getRepository(AdminRoleAssignment).save({
      userId: superUser.id,
      role: AdminRole.SUPER_ADMIN,
      active: true,
      grantedById: superUser.id,
    });
    const superToken = await login(superUser.email!);
    const planPayload = {
      name: 'Standard USD split',
      type: 'PER_DELIVERY',
      effectiveFrom: '2026-10-01T00:00:00.000Z',
      components: {
        deliveryAllocation: {
          platformFixedAmount: '0',
          platformPercentage: 25,
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
    };
    const request = (path: string, token: string, body: unknown) =>
      fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    const adminWrite = await request(
      '/driver-compensation-plans',
      adminToken,
      planPayload,
    );
    expect(adminWrite.status).toBe(403);
    const wrongCurrency = await request(
      '/driver-compensation-plans',
      superToken,
      {
        ...planPayload,
        components: {
          ...planPayload.components,
          recurringCharge: {
            ...planPayload.components.recurringCharge,
            currency: 'LBP',
          },
        },
      },
    );
    expect(wrongCurrency.status).toBe(400);
    expect(
      (
        await request('/driver-compensation-plans', superToken, {
          name: 'Missing terms',
          type: 'PER_DELIVERY',
        })
      ).status,
    ).toBe(400);
    const minimal = await request('/driver-compensation-plans', superToken, {
      name: 'Defaults',
      type: 'PER_DELIVERY',
      components: {
        deliveryAllocation: {},
        recurringCharge: { type: 'NONE', currency: 'USD' },
      },
    });
    expect(minimal.status).toBe(201);
    expect(await minimal.json()).toMatchObject({
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
    const nullMoney = await request('/driver-compensation-plans', superToken, {
      ...planPayload,
      components: {
        ...planPayload.components,
        deliveryAllocation: {
          ...planPayload.components.deliveryAllocation,
          platformFixedAmount: null,
        },
      },
    });
    expect(nullMoney.status).toBe(400);
    const created = await request(
      '/driver-compensation-plans',
      superToken,
      planPayload,
    );
    expect(created.status).toBe(201);
    const plan = (await created.json()) as { id: string };
    expect(
      (await (
        await fetch(`${baseUrl}/driver-compensation-plans/${plan.id}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        })
      ).json()) as { name: string },
    ).toMatchObject({ name: 'Standard USD split' });

    const driver = await database.dataSource
      .getRepository(DriverProfile)
      .findOneByOrFail({ userId: driverUserId });
    const path = `/drivers/${driver.id}/plan-assignments`;
    const first = await request(path, superToken, {
      planId: plan.id,
      effectiveFrom: '2026-11-08T00:00:00Z',
      effectiveTo: '2026-11-12T00:00:00Z',
    });
    expect(first.status).toBe(201);
    const overlap = await request(path, superToken, {
      planId: plan.id,
      effectiveFrom: '2026-11-09T00:00:00Z',
      effectiveTo: '2026-11-13T00:00:00Z',
    });
    expect(overlap.status).toBe(409);
    const adjacent = await request(path, superToken, {
      planId: plan.id,
      effectiveFrom: '2026-11-12T00:00:00Z',
      effectiveTo: '2026-11-16T00:00:00Z',
    });
    expect(adjacent.status).toBe(201);
    const invalidInterval = await request(path, superToken, {
      planId: plan.id,
      effectiveFrom: '2026-11-17T00:00:00Z',
      effectiveTo: '2026-11-16T00:00:00Z',
    });
    expect(invalidInterval.status).toBe(400);
    const open = await request(path, superToken, {
      planId: plan.id,
      effectiveFrom: '2026-11-16T00:00:00Z',
    });
    expect(open.status).toBe(201);
    const results = await Promise.all([
      request(path, superToken, {
        planId: plan.id,
        effectiveFrom: '2026-11-20T00:00:00Z',
        effectiveTo: '2026-11-25T00:00:00Z',
      }),
      request(path, superToken, {
        planId: plan.id,
        effectiveFrom: '2026-11-21T00:00:00Z',
        effectiveTo: '2026-11-26T00:00:00Z',
      }),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
    const history = await fetch(`${baseUrl}${path}?take=10&skip=0`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(history.status).toBe(200);
    expect(((await history.json()) as { items: unknown[] }).items).toHaveLength(
      4,
    );
    expect(
      await database.dataSource
        .getRepository(AuditLog)
        .countBy({ action: 'driver_plan.assign' }),
    ).toBe(4);
    const retire = (
      token: string,
      id: string,
      effectiveTo = '2026-11-30T00:00:00Z',
    ) =>
      fetch(`${baseUrl}/driver-compensation-plans/${id}/retirement`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ effectiveTo }),
      });
    expect((await retire(adminToken, plan.id)).status).toBe(403);
    expect(
      (await retire(superToken, plan.id, '2026-11-23T00:00:00Z')).status,
    ).toBe(409);
    const nextPlanResponse = await request(
      '/driver-compensation-plans',
      superToken,
      { ...planPayload, name: 'Next terms' },
    );
    expect(nextPlanResponse.status).toBe(201);
    const nextPlan = (await nextPlanResponse.json()) as { id: string };
    const retired = await retire(superToken, nextPlan.id);
    expect(retired.status).toBe(200);
    expect(await retired.json()).toMatchObject({
      name: 'Next terms',
      active: false,
    });
    expect(
      (
        await request(path, superToken, {
          planId: nextPlan.id,
          effectiveFrom: '2026-11-27T00:00:00Z',
        })
      ).status,
    ).toBe(400);
    await expect(
      database.dataSource.query(
        `UPDATE "driver_compensation_plans" SET "components" = '{}'::jsonb WHERE "id" = $1`,
        [plan.id],
      ),
    ).rejects.toMatchObject({ code: 'P0001' });
    await expect(
      database.dataSource.query(
        `UPDATE "driver_profiles" SET "currency" = 'LBP' WHERE "id" = $1`,
        [driver.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('posts and replays C06 through separate compiled application processes against the API database', async () => {
    const actor = await database.dataSource
      .getRepository(User)
      .save({ phone: '+96171081004', displayName: 'Compiled ledger actor' });
    const driverUser = await database.dataSource
      .getRepository(User)
      .save({ phone: '+96171081005', displayName: 'Compiled ledger driver' });
    const driver = await database.dataSource
      .getRepository(DriverProfile)
      .save({ userId: driverUser.id, vehicleType: 'bike', active: true });
    const delivery = await database.dataSource.getRepository(Delivery).save({
      trackingCode: randomUUID(),
      secureTrackingToken: randomUUID(),
      createdByUserId: actor.id,
      driverId: driver.id,
      deliveryFee: '500',
      collectableAmount: '500',
    });
    const input = {
      kind: 'priced',
      sourceId: delivery.id,
      createdById: actor.id,
      occurredAt: '2026-11-07T08:00:00.000Z',
      entries: [
        {
          entryType: 'DELIVERY_FEE_CHARGED',
          amount: '500',
          currency: 'USD',
          deliveryId: delivery.id,
          beneficiaryType: 'user',
          beneficiaryUserId: actor.id,
        },
        {
          entryType: 'DRIVER_EARNING',
          amount: '400',
          currency: 'USD',
          deliveryId: delivery.id,
          driverId: driver.id,
          beneficiaryType: 'user',
          beneficiaryUserId: driverUser.id,
        },
        {
          entryType: 'PLATFORM_DELIVERY_REVENUE',
          amount: '100',
          currency: 'USD',
          deliveryId: delivery.id,
          beneficiaryType: 'platform',
        },
      ],
    };
    const connection = database.connection;
    const compiledEnv = {
      ...process.env,
      APP_ENV: 'test',
      OTP_STATE: 'memory',
      DB_HOST: connection.host,
      DB_PORT: String(connection.port),
      DB_USER: connection.username,
      DB_PASSWORD: connection.password,
      DB_NAME: connection.database,
      JWT_ACCESS_SECRET: 'c06-compiled-ledger-access-secret',
      JWT_REFRESH_SECRET: 'c06-compiled-ledger-refresh-secret',
      C06_TEST_EVENT: JSON.stringify(input),
      C06_TEST_DRIVER: driver.id,
    };
    const script = `
      require('reflect-metadata');
      const { NestFactory } = require('@nestjs/core');
      const { AppModule } = require('./dist/app.module');
      const { LedgerService } = require('./dist/modules/finance/ledger.service');
      (async () => {
        const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
        try {
          const ledger = app.get(LedgerService);
          const input = JSON.parse(process.env.C06_TEST_EVENT);
          const posted = await ledger.post(input);
          const balance = await ledger.deriveBalance({ type: 'driver', id: process.env.C06_TEST_DRIVER, currency: 'USD' });
          console.log('C06_RESULT=' + JSON.stringify({ eventId: posted.event.id, entryIds: posted.entries.map(e => e.id), balance }));
        } finally { await app.close(); }
      })().catch(() => { process.exitCode = 1; });
    `;
    const first = await promisify(execFile)(process.execPath, ['-e', script], {
      env: compiledEnv,
      timeout: 15000,
    });
    const second = await promisify(execFile)(process.execPath, ['-e', script], {
      env: compiledEnv,
      timeout: 15000,
    });
    const result = (stdout: string) =>
      JSON.parse(
        stdout
          .split('\n')
          .find((line) => line.startsWith('C06_RESULT='))!
          .slice('C06_RESULT='.length),
      );
    const posted = result(first.stdout);
    expect(result(second.stdout)).toEqual(posted);
    expect(posted.balance).toBe('400');
    expect(posted.entryIds).toHaveLength(3);
    expect(
      await database.dataSource
        .getRepository(AuditLog)
        .countBy({ entityId: posted.eventId, action: 'ledger.post' }),
    ).toBe(1);
    const invalid = {
      ...input,
      entries: input.entries.map((entry) => ({ ...entry, currency: 'LBP' })),
    };
    const rejected = await promisify(execFile)(
      process.execPath,
      ['-e', script],
      {
        env: { ...compiledEnv, C06_TEST_EVENT: JSON.stringify(invalid) },
        timeout: 15000,
      },
    ).then(
      () => false,
      () => true,
    );
    expect(rejected).toBe(true);
    expect((await fetch(baseUrl + '/health')).status).toBe(200);
  });
});
