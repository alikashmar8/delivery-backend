import { AddPricedSnapshots1700000000015 } from '../src/database/migrations/1700000000015-AddPricedSnapshots';
import { DeliveryFinancialSnapshot } from '../src/modules/finance/entities/delivery-financial-snapshot.entity';
import { AddImmutableLedger1700000000014 } from '../src/database/migrations/1700000000014-AddImmutableLedger';
import { LedgerEntry } from '../src/modules/finance/entities/ledger-entry.entity';
import { LedgerEvent } from '../src/modules/finance/entities/ledger-event.entity';
import { hash } from 'argon2';
import type { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
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

const ENV_KEYS = [
  'APP_ENV',
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'JWT_ACCESS_EXPIRATION',
  'JWT_REFRESH_EXPIRATION',
] as const;

describe('S05 platform-admin role reconciliation through HTTP', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let actor: User;
  let secondSuperAdmin: User;
  let admin: User;
  let target: User;
  let actorToken: string;
  let secondSuperAdminToken: string;
  let adminToken: string;
  let originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string>>;

  beforeAll(async () => {
    database = await createPostgisDatabase(entities, migrations);
    originalEnv = Object.fromEntries(
      ENV_KEYS.map((key) => [key, process.env[key]]),
    );
    process.env.APP_ENV = 'test';
    process.env.DB_HOST = database.connection.host;
    process.env.DB_PORT = String(database.connection.port);
    process.env.DB_NAME = database.connection.database;
    process.env.DB_USER = database.connection.username;
    process.env.DB_PASSWORD = database.connection.password;
    process.env.JWT_ACCESS_SECRET = 's05-role-access-secret-value';
    process.env.JWT_REFRESH_SECRET = 's05-role-refresh-secret-value';
    process.env.JWT_ACCESS_EXPIRATION = '15m';
    process.env.JWT_REFRESH_EXPIRATION = '14d';

    const users = database.dataSource.getRepository(User);
    const passwordHash = await hash('s05-role-password');
    actor = await users.save(
      users.create({
        phone: '+96171070001',
        email: 's05-role-actor@example.com',
        displayName: 'S05 role actor',
        passwordHash,
      }),
    );
    secondSuperAdmin = await users.save(
      users.create({
        phone: '+96171070002',
        email: 's05-role-second@example.com',
        displayName: 'S05 second super admin',
        passwordHash,
      }),
    );
    admin = await users.save(
      users.create({
        phone: '+96171070003',
        email: 's05-role-admin@example.com',
        displayName: 'S05 admin',
        passwordHash,
      }),
    );
    target = await users.save(
      users.create({
        phone: '+96171070004',
        email: 's05-role-target@example.com',
        displayName: 'S05 role target',
        passwordHash,
      }),
    );
    await database.dataSource.getRepository(AdminRoleAssignment).save([
      {
        userId: actor.id,
        role: AdminRole.SUPER_ADMIN,
        active: true,
        grantedById: actor.id,
      },
      {
        userId: secondSuperAdmin.id,
        role: AdminRole.SUPER_ADMIN,
        active: true,
        grantedById: actor.id,
      },
      {
        userId: admin.id,
        role: AdminRole.ADMIN,
        active: true,
        grantedById: actor.id,
      },
    ]);

    const { AppModule } = await import('../src/app.module');
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(appValidationPipe);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    dataSource = moduleRef.get(DataSource);

    actorToken = await login(actor.email!, 's05-role-password');
    secondSuperAdminToken = await login(
      secondSuperAdmin.email!,
      's05-role-password',
    );
    adminToken = await login(admin.email!, 's05-role-password');
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    if (database) await database.close();
  });

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login/password')
      .send({ email, password })
      .expect(200);
    return response.body.accessToken as string;
  }

  function roleRequest(token: string, userId: string, roles: AdminRole[]) {
    return request(app.getHttpServer())
      .post(`/users/${userId}/admin-roles`)
      .set('Authorization', `Bearer ${token}`)
      .set('User-Agent', 's05-role-client/1.0')
      .send({ roles });
  }

  it('passes the baseline health, 401, login and bearer checks', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/users/me').expect(401);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${actorToken}`)
      .expect(200);
  });

  it('reconciles desired roles and batches secret-free audit records', async () => {
    const response = await roleRequest(actorToken, target.id, [
      AdminRole.ADMIN,
      AdminRole.SUPPORT,
    ]).expect(200);

    expect(response.body).toMatchObject({
      userId: target.id,
      roles: [AdminRole.ADMIN, AdminRole.SUPPORT],
      changed: true,
    });
    expect(response.body.assignments).toHaveLength(2);

    const audit = await dataSource.getRepository(AuditLog).find({
      where: { entityType: 'AdminRoleAssignment', actorId: actor.id },
      order: { createdAt: 'ASC' },
    });
    expect(audit).toHaveLength(2);
    expect(
      audit.every((entry) => entry.userAgent === 's05-role-client/1.0'),
    ).toBe(true);
    expect(JSON.stringify(audit)).not.toContain('passwordHash');
  });

  it('is idempotent and revokes omitted roles without deleting relations', async () => {
    const duplicate = await roleRequest(actorToken, target.id, [
      AdminRole.ADMIN,
      AdminRole.SUPPORT,
    ]).expect(200);
    expect(duplicate.body.changed).toBe(false);

    const afterDuplicate = await dataSource.getRepository(AuditLog).count({
      where: { entityType: 'AdminRoleAssignment', actorId: actor.id },
    });
    expect(afterDuplicate).toBe(2);

    const reduced = await roleRequest(actorToken, target.id, [
      AdminRole.SUPPORT,
    ]).expect(200);
    expect(reduced.body.roles).toEqual([AdminRole.SUPPORT]);
    expect(reduced.body.changed).toBe(true);

    const assignments = await dataSource
      .getRepository(AdminRoleAssignment)
      .find({ where: { userId: target.id }, order: { role: 'ASC' } });
    expect(assignments).toHaveLength(2);
    expect(
      assignments.find((item) => item.role === AdminRole.ADMIN)?.active,
    ).toBe(false);
    expect(
      assignments.find((item) => item.role === AdminRole.SUPPORT)?.active,
    ).toBe(true);

    const adminAssignmentId = assignments.find(
      (item) => item.role === AdminRole.ADMIN,
    )?.id;
    const restored = await roleRequest(actorToken, target.id, [
      AdminRole.ADMIN,
      AdminRole.SUPPORT,
    ]).expect(200);
    expect(restored.body.roles).toEqual([AdminRole.ADMIN, AdminRole.SUPPORT]);
    expect(restored.body.changed).toBe(true);
    const restoredAdminAssignment = await dataSource
      .getRepository(AdminRoleAssignment)
      .findOneBy({ userId: target.id, role: AdminRole.ADMIN });
    expect(restoredAdminAssignment?.id).toBe(adminAssignmentId);

    await roleRequest(actorToken, target.id, []).expect(200);
    expect(
      await dataSource.getRepository(AdminRoleAssignment).count({
        where: { userId: target.id, active: true },
      }),
    ).toBe(0);
  });

  it('requires a super admin and validates the complete desired set', async () => {
    await roleRequest(adminToken, target.id, [AdminRole.SUPPORT]).expect(403);
    await roleRequest(actorToken, target.id, [
      'not-a-role' as AdminRole,
    ]).expect(400);
    await request(app.getHttpServer())
      .post(`/users/${target.id}/admin-roles`)
      .set('Authorization', `Bearer ${actorToken}`)
      .send({ roles: [AdminRole.SUPPORT], unexpected: true })
      .expect(400);
  });

  it('lets super admins use narrower admin routes', async () => {
    await request(app.getHttpServer())
      .get(`/users/${target.id}`)
      .set('Authorization', `Bearer ${actorToken}`)
      .expect(200);
  });

  it('prevents concurrent removal of the final active super admin', async () => {
    const [first, second] = await Promise.all([
      roleRequest(actorToken, actor.id, []),
      roleRequest(secondSuperAdminToken, secondSuperAdmin.id, []),
    ]);

    expect([first.status, second.status].sort()).toEqual([200, 409]);
    expect(
      await dataSource.getRepository(AdminRoleAssignment).count({
        where: { role: AdminRole.SUPER_ADMIN, active: true },
      }),
    ).toBe(1);
  });
});
