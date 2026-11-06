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
import {
  AdminRole,
  AdminRoleAssignment,
} from '../src/modules/users/entities/admin-role-assignment.entity';
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

describe('S05 audit through the compiled entrypoint', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let child: ReturnType<typeof spawn> | undefined;
  let exited: Promise<unknown> | undefined;
  let baseUrl: string;
  const email = `s05-compiled-${randomUUID()}@example.test`;
  const password = 's05-compiled-password';
  let targetUserId: string;

  beforeAll(async () => {
    database = await createPostgisDatabase(entities, migrations);
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
    const protectedResponse = await fetch(`${baseUrl}/users/me`);
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
    expect(audit.ipAddress).toBeTruthy();
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
});
