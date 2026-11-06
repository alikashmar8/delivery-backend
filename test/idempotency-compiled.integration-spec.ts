import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
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
import { User } from '../src/modules/users/entities/user.entity';
import { DeliveryZone } from '../src/modules/zones/entities/delivery-zone.entity';
import { createPostgisDatabase } from './helpers/postgis-database';

const entities = [
  User,
  DriverProfile,
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
];

describe('persistent delivery idempotency through the compiled entrypoint', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let child: ReturnType<typeof spawn> | undefined;
  let exited: Promise<unknown> | undefined;
  let baseUrl: string;
  const accessSecret = 's04-compiled-access-secret-value';
  const refreshSecret = 's04-compiled-refresh-secret-value';
  const email = `s04-compiled-${randomUUID()}@example.test`;
  const password = 's04-compiled-password';

  beforeAll(async () => {
    database = await createPostgisDatabase(entities, migrations);
    const source = database.dataSource;
    const user = await source.getRepository(User).save({
      phone: '+96171000001',
      email,
      displayName: 'S04 compiled user',
      passwordHash: await hash(password),
    });
    await source.getRepository(PricingRule).save({
      businessId: null,
      zoneId: null,
      currency: 'USD',
      baseFee: '500',
      perKm: null,
      zoneSurcharge: '0',
      codFeePercent: null,
      priority: 0,
      active: true,
      effectiveTo: null,
    });
    expect(user.id).toEqual(expect.any(String));
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
        JWT_ACCESS_SECRET: accessSecret,
        JWT_REFRESH_SECRET: refreshSecret,
      },
      stdio: 'ignore',
    });
    exited = once(child, 'exit');

    let response: Response | undefined;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect(
        child.exitCode,
        'compiled backend exited before listening',
      ).toBeNull();
      try {
        response = await fetch(`${baseUrl}/health`, {
          signal: AbortSignal.timeout(1000),
        });
        break;
      } catch {
        await setTimeout(100);
      }
    }
    expect(response, 'compiled backend did not begin listening').toBeDefined();
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

  async function login(): Promise<string> {
    const response = await fetch(`${baseUrl}/auth/login/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { accessToken: string };
    return body.accessToken;
  }

  function deliveryBody(note: string) {
    return {
      codAmount: '0',
      notes: note,
      recipient: {
        name: 'S04 Compiled Recipient',
        phone: '+96171000002',
        city: 'Beirut',
        latitude: 33.9,
        longitude: 35.5,
      },
      pickupAddress: {
        city: 'Beirut',
        latitude: 33.92,
        longitude: 35.55,
      },
    };
  }

  async function createDelivery(
    token: string,
    key: string,
    body: ReturnType<typeof deliveryBody>,
  ): Promise<Response> {
    return await fetch(`${baseUrl}/deliveries`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify(body),
    });
  }

  it('proves replay, conflict, concurrency and restart on compiled HTTP', async () => {
    const token = await login();
    const key = randomUUID();
    const body = deliveryBody('compiled');

    const first = await createDelivery(token, key, body);
    expect(first.status).toBe(201);
    const firstBody = await first.json();

    const replay = await createDelivery(token, key, body);
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(firstBody);

    const conflict = await createDelivery(token, key, {
      ...body,
      notes: 'compiled conflict',
    });
    expect(conflict.status).toBe(409);

    const concurrentKey = randomUUID();
    const concurrentBody = deliveryBody('compiled concurrent');
    const concurrent = await Promise.all([
      createDelivery(token, concurrentKey, concurrentBody),
      createDelivery(token, concurrentKey, concurrentBody),
    ]);
    expect(concurrent.map((response) => response.status).sort()).toEqual([
      201, 201,
    ]);
    expect(await concurrent[0].clone().json()).toEqual(
      await concurrent[1].clone().json(),
    );

    await stopCompiledApp();
    await startCompiledApp();
    const restartedToken = await login();
    const restarted = await createDelivery(restartedToken, key, body);
    expect(restarted.status).toBe(201);
    expect(await restarted.json()).toEqual(firstBody);
  });
});
