import { AddPricedSnapshots1700000000015 } from '../src/database/migrations/1700000000015-AddPricedSnapshots';
import { DeliveryFinancialSnapshot } from '../src/modules/finance/entities/delivery-financial-snapshot.entity';
import { AddImmutableLedger1700000000014 } from '../src/database/migrations/1700000000014-AddImmutableLedger';
import { LedgerEntry } from '../src/modules/finance/entities/ledger-entry.entity';
import { LedgerEvent } from '../src/modules/finance/entities/ledger-event.entity';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  createServer as createHttpServer,
  request as httpRequest,
} from 'node:http';
import { createServer } from 'node:net';
import type { AddressInfo } from 'node:net';
import { setTimeout } from 'node:timers/promises';
import { hash } from 'argon2';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PASSWORD_IP_LIMIT } from '../src/modules/auth/auth.service';
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
import { createEphemeralRedis } from './helpers/redis-container';

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

describe('S05 audit through the compiled entrypoint', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let redis: Awaited<ReturnType<typeof createEphemeralRedis>>;
  let child: ReturnType<typeof spawn> | undefined;
  let exited: Promise<unknown> | undefined;
  let baseUrl: string;
  const email = `s05-compiled-${randomUUID()}@example.test`;
  const password = 's05-compiled-password';
  let targetUserId: string;

  beforeAll(async () => {
    database = await createPostgisDatabase(entities, migrations);
    redis = await createEphemeralRedis();
    const source = database.dataSource;
    const user = await source.getRepository(User).save({
      phone: '+96171060001',
      email,
      displayName: 'S05 compiled actor',
      passwordHash: await hash(password),
    });
    await source.getRepository(AdminRoleAssignment).save({
      userId: user.id,
      role: AdminRole.SUPER_ADMIN,
      active: true,
      grantedById: user.id,
    });
    const target = await source.getRepository(User).save({
      phone: '+96171060002',
      email: `s05-compiled-target-${randomUUID()}@example.test`,
      displayName: 'S05 compiled target',
      passwordHash: await hash(password),
    });
    targetUserId = target.id;
    await startCompiledApp();
  });

  afterAll(async () => {
    await stopCompiledApp();
    if (redis) await redis.close();
    if (database) await database.close();
  });

  beforeEach(async () => {
    await redis.client.flushdb();
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
        OTP_STATE: 'redis',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: String(redis.client.options.port),
        DB_HOST: connection.host,
        DB_PORT: String(connection.port),
        DB_USER: connection.username,
        DB_PASSWORD: connection.password,
        DB_NAME: connection.database,
        JWT_ACCESS_SECRET: 's05-compiled-access-secret-value',
        JWT_REFRESH_SECRET: 's05-compiled-refresh-secret-value',
      },
      stdio: 'ignore',
    });
    exited = once(child, 'exit');

    let response: Response | undefined;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      expect(child.exitCode).toBeNull();
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

  it('captures audit metadata and correlated conflict responses', async () => {
    const protectedResponse = await fetch(`${baseUrl}/users/me`, {
      headers: { 'X-Forwarded-For': '10.1.2.3' },
    });
    expect(protectedResponse.status).toBe(401);

    const login = await fetch(`${baseUrl}/auth/login/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const { accessToken } = (await login.json()) as { accessToken: string };

    const pricing = await fetch(`${baseUrl}/pricing-rules`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 's05-compiled-client/1.0',
        'X-Forwarded-For': '203.0.113.99, 10.1.2.3',
        Forwarded: 'for=203.0.113.99',
        'X-Real-IP': '203.0.113.99',
      },
      body: JSON.stringify({ baseFee: '500', currency: 'USD' }),
    });
    expect(pricing.status).toBe(201);
    const pricingBody = (await pricing.json()) as { id: string };
    const audit = await database.dataSource
      .getRepository(AuditLog)
      .findOneOrFail({
        where: { action: 'pricing.create', entityId: pricingBody.id },
      });
    expect(audit.ipAddress).toBe('127.0.0.1');
    expect(audit.userAgent).toBe('s05-compiled-client/1.0');

    const business = await fetch(`${baseUrl}/businesses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'S05 compiled business',
        slug: `s05-compiled-${Date.now()}`,
        contactPhone: '+96171060001',
      }),
    });
    expect(business.status).toBe(201);
    const businessBody = (await business.json()) as { slug: string };
    const requestId = 's05-compiled-conflict';
    const conflict = await fetch(`${baseUrl}/businesses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Request-ID': requestId,
      },
      body: JSON.stringify({
        name: 'S05 duplicate business',
        slug: businessBody.slug,
        contactPhone: '+96171060001',
      }),
    });
    expect(conflict.status).toBe(409);
    expect(conflict.headers.get('x-request-id')).toBe(requestId);
    expect(await conflict.json()).toMatchObject({
      error: { code: 'CONFLICT', requestId },
    });

    const roleUpdate = await fetch(
      `${baseUrl}/users/${targetUserId}/admin-roles`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'User-Agent': 's05-compiled-role-client/1.0',
        },
        body: JSON.stringify({ roles: [AdminRole.ADMIN, AdminRole.SUPPORT] }),
      },
    );
    expect(roleUpdate.status).toBe(200);
    expect(await roleUpdate.json()).toMatchObject({
      userId: targetUserId,
      roles: [AdminRole.ADMIN, AdminRole.SUPPORT],
      changed: true,
    });

    const roleAssignments = await database.dataSource
      .getRepository(AdminRoleAssignment)
      .find({ where: { userId: targetUserId, active: true } });
    expect(roleAssignments).toHaveLength(2);
    const roleAudits = await database.dataSource.getRepository(AuditLog).find({
      where: { action: 'admin_role.grant' },
    });
    expect(roleAudits).toHaveLength(2);
    expect(
      roleAudits.every(
        (entry) => entry.userAgent === 's05-compiled-role-client/1.0',
      ),
    ).toBe(true);
  });

  it('cannot rotate forwarded headers to bypass the Redis per-IP password limit', async () => {
    for (let attempt = 0; attempt <= PASSWORD_IP_LIMIT; attempt += 1) {
      const response = await fetch(`${baseUrl}/auth/login/password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': `198.51.100.${attempt + 1}`,
        },
        // Different unknown accounts avoid the separate per-email limit.
        body: JSON.stringify({
          email: `proxy-limit-${attempt}@example.test`,
          password,
        }),
      });
      expect(response.status).toBe(attempt < PASSWORD_IP_LIMIT ? 401 : 429);
    }
  });

  it('preserves auth and audit through a real local reverse proxy with trust disabled', async () => {
    const proxy = createHttpServer((incoming, outgoing) => {
      const upstream = httpRequest(
        `${baseUrl}${incoming.url}`,
        {
          method: incoming.method,
          headers: {
            ...incoming.headers,
            'x-forwarded-for': '203.0.113.99, 198.51.100.23',
          },
        },
        (response) => {
          outgoing.writeHead(response.statusCode!, response.headers);
          response.pipe(outgoing);
        },
      );
      upstream.on('error', () => outgoing.writeHead(502).end());
      incoming.pipe(upstream);
    });
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    const proxyUrl = `http://127.0.0.1:${(proxy.address() as AddressInfo).port}`;
    try {
      expect((await fetch(`${proxyUrl}/users/me`)).status).toBe(401);
      const login = await fetch(`${proxyUrl}/auth/login/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      expect(login.status).toBe(200);
      const { accessToken } = (await login.json()) as { accessToken: string };
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      };
      expect((await fetch(`${proxyUrl}/users/me`, { headers })).status).toBe(
        200,
      );
      const invalid = await fetch(`${proxyUrl}/pricing-rules`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ baseFee: '-1' }),
      });
      expect(invalid.status).toBe(400);
      const pricing = await fetch(`${proxyUrl}/pricing-rules`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ baseFee: '500', currency: 'USD' }),
      });
      expect(pricing.status).toBe(201);
      const { id } = (await pricing.json()) as { id: string };
      const audit = await database.dataSource
        .getRepository(AuditLog)
        .findOneOrFail({
          where: { action: 'pricing.create', entityId: id },
        });
      expect(audit.ipAddress).toBe('127.0.0.1');
    } finally {
      await new Promise<void>((resolve, reject) =>
        proxy.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
