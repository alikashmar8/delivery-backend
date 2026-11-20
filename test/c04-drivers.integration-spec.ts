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
import { Address } from '../src/modules/addresses/entities/address.entity';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { BusinessMember } from '../src/modules/businesses/entities/business-member.entity';
import { Business } from '../src/modules/businesses/entities/business.entity';
import { DeliveryAddress } from '../src/modules/deliveries/entities/delivery-address.entity';
import { DeliveryStatusHistory } from '../src/modules/deliveries/entities/delivery-status-history.entity';
import {
  Delivery,
  DeliveryStatus,
} from '../src/modules/deliveries/entities/delivery.entity';
import { Recipient } from '../src/modules/deliveries/entities/recipient.entity';
import { IdempotencyKey } from '../src/modules/idempotency/entities/idempotency-key.entity';
import { PricingRule } from '../src/modules/pricing/entities/pricing-rule.entity';
import { Region } from '../src/modules/regions/entities/region.entity';
import {
  AdminRole,
  AdminRoleAssignment,
} from '../src/modules/users/entities/admin-role-assignment.entity';
import {
  DriverAvailability,
  DriverProfile,
} from '../src/modules/users/entities/driver-profile.entity';
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

describe('C04 driver capability and availability through HTTP', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let admin: User;
  let support: User;
  let driverUser: User;
  let otherDriverUser: User;
  let adminToken: string;
  let supportToken: string;
  let driverToken: string;
  let driverProfileId: string;
  let driverVersion: number;
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
    process.env.JWT_ACCESS_SECRET = 'c04-driver-access-secret-value';
    process.env.JWT_REFRESH_SECRET = 'c04-driver-refresh-secret-value';
    process.env.JWT_ACCESS_EXPIRATION = '15m';
    process.env.JWT_REFRESH_EXPIRATION = '14d';

    const users = database.dataSource.getRepository(User);
    const passwordHash = await hash('c04-driver-password');
    admin = await users.save(
      users.create({
        phone: '+96171080001',
        email: 'c04-admin@example.com',
        displayName: 'C04 admin',
        passwordHash,
      }),
    );
    support = await users.save(
      users.create({
        phone: '+96171080002',
        email: 'c04-support@example.com',
        displayName: 'C04 support',
        passwordHash,
      }),
    );
    driverUser = await users.save(
      users.create({
        phone: '+96171080003',
        email: 'c04-driver@example.com',
        displayName: 'C04 driver',
        passwordHash,
      }),
    );
    otherDriverUser = await users.save(
      users.create({
        phone: '+96171080004',
        email: 'c04-other-driver@example.com',
        displayName: 'C04 other driver',
        passwordHash,
      }),
    );
    await database.dataSource.getRepository(AdminRoleAssignment).save([
      {
        userId: admin.id,
        role: AdminRole.ADMIN,
        active: true,
        grantedById: admin.id,
      },
      {
        userId: support.id,
        role: AdminRole.SUPPORT,
        active: true,
        grantedById: admin.id,
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

    adminToken = await login(admin.email!, 'c04-driver-password');
    supportToken = await login(support.email!, 'c04-driver-password');
    driverToken = await login(driverUser.email!, 'c04-driver-password');
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

  function availabilityRequest(
    availability: DriverAvailability,
    expectedVersion: number,
  ) {
    return request(app.getHttpServer())
      .post('/drivers/me/availability')
      .set('Authorization', `Bearer ${driverToken}`)
      .set('User-Agent', 'c04-driver-client/1.0')
      .send({ availability, expectedVersion });
  }

  it('passes the health, unauthenticated denial, login and bearer baseline', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          status: 'ok',
          info: { database: { status: 'up' } },
        });
      });
    await request(app.getHttpServer()).get('/drivers').expect(401);
    await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
  });

  it('returns only current active platform roles for capability routing', async () => {
    for (const [token, roles] of [
      [adminToken, [AdminRole.ADMIN]],
      [supportToken, [AdminRole.SUPPORT]],
      [driverToken, []],
    ] as const) {
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.body.adminRoles).toEqual(roles);
    }
    const assignments = dataSource.getRepository(AdminRoleAssignment);
    await assignments.update({ userId: support.id }, { active: false });
    try {
      const response = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${supportToken}`)
        .expect(200);
      expect(response.body.adminRoles).toEqual([]);
      await request(app.getHttpServer())
        .get('/drivers')
        .set('Authorization', `Bearer ${supportToken}`)
        .expect(403);
    } finally {
      await assignments.update({ userId: support.id }, { active: true });
    }
  });

  it('onboards an inactive driver and writes a safe audit record', async () => {
    const response = await request(app.getHttpServer())
      .post(`/users/${driverUser.id}/driver-profile`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', 'c04-admin-client/1.0')
      .send({
        vehicleType: 'motorcycle',
        vehiclePlate: 'C04-123',
        license: 'private-license-value',
      })
      .expect(201);

    expect(response.body).toMatchObject({
      userId: driverUser.id,
      vehicleType: 'motorcycle',
      vehiclePlate: 'C04-123',
      active: false,
      availability: DriverAvailability.OFFLINE,
      version: 1,
    });
    expect(response.body).not.toHaveProperty('license');
    driverProfileId = response.body.id as string;
    driverVersion = response.body.version as number;

    const audit = await dataSource.getRepository(AuditLog).findOneByOrFail({
      action: 'driver.onboard',
      entityId: driverProfileId,
    });
    expect(audit.userAgent).toBe('c04-admin-client/1.0');
    expect(JSON.stringify(audit)).not.toContain('private-license-value');
    expect(JSON.stringify(audit)).not.toContain('passwordHash');

    await request(app.getHttpServer())
      .post(`/users/${driverUser.id}/driver-profile`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ vehicleType: 'motorcycle' })
      .expect(409);

    const list = await request(app.getHttpServer())
      .get('/drivers?take=20&skip=0')
      .set('Authorization', `Bearer ${supportToken}`)
      .expect(200);
    expect(list.body.items).toContainEqual(
      expect.objectContaining({ id: driverProfileId, active: false }),
    );
  });

  it('blocks support mutations and all pending-driver operational access', async () => {
    await request(app.getHttpServer())
      .patch(`/drivers/${driverProfileId}/activation`)
      .set('Authorization', `Bearer ${supportToken}`)
      .send({ active: true, expectedVersion: driverVersion })
      .expect(403);

    await availabilityRequest(DriverAvailability.ONLINE, driverVersion).expect(
      403,
    );
    await request(app.getHttpServer())
      .get('/drivers/me/deliveries?take=20&skip=0')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(403);
  });

  it('approves a driver and resolves concurrent availability writes by version', async () => {
    const activation = await request(app.getHttpServer())
      .patch(`/drivers/${driverProfileId}/activation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', 'c04-admin-client/1.0')
      .send({ active: true, expectedVersion: driverVersion })
      .expect(200);
    expect(activation.body).toMatchObject({
      active: true,
      availability: DriverAvailability.OFFLINE,
      changed: true,
    });
    driverVersion = activation.body.version as number;

    const online = await availabilityRequest(
      DriverAvailability.ONLINE,
      driverVersion,
    ).expect(200);
    expect(online.body).toMatchObject({
      active: true,
      availability: DriverAvailability.ONLINE,
      changed: true,
    });
    driverVersion = online.body.version as number;

    await availabilityRequest(DriverAvailability.ONLINE, driverVersion)
      .expect(200)
      .expect((response) => {
        expect(response.body).toMatchObject({
          availability: DriverAvailability.ONLINE,
          changed: false,
          version: driverVersion,
        });
      });

    const [first, second] = await Promise.all([
      availabilityRequest(DriverAvailability.OFFLINE, driverVersion),
      availabilityRequest(DriverAvailability.OFFLINE, driverVersion),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const changed = [first, second].find(
      (response) => response.status === 200,
    )!;
    driverVersion = changed.body.version as number;

    await availabilityRequest(
      DriverAvailability.ON_DELIVERY,
      driverVersion,
    ).expect(400);
  });

  it("returns only the active driver's bounded queue", async () => {
    const profiles = dataSource.getRepository(DriverProfile);
    const otherProfile = await profiles.save(
      profiles.create({
        userId: otherDriverUser.id,
        vehicleType: 'car',
        active: true,
        availability: DriverAvailability.ONLINE,
      }),
    );
    const deliveries = dataSource.getRepository(Delivery);
    const ownDelivery = await deliveries.save(
      deliveries.create({
        trackingCode: 'C04-OWN-DELIVERY',
        secureTrackingToken:
          'c04-own-delivery-secure-tracking-token-000000000000000000000000',
        createdByUserId: admin.id,
        driverId: driverProfileId,
        status: DeliveryStatus.ASSIGNED,
      }),
    );
    await deliveries.save(
      deliveries.create({
        trackingCode: 'C04-OTHER-DELIVERY',
        secureTrackingToken:
          'c04-other-delivery-secure-tracking-token-0000000000000000000000',
        createdByUserId: admin.id,
        driverId: otherProfile.id,
        status: DeliveryStatus.ASSIGNED,
      }),
    );

    const queue = await request(app.getHttpServer())
      .get('/drivers/me/deliveries?take=1&skip=0')
      .set('Authorization', `Bearer ${driverToken}`)
      .expect(200);
    expect(queue.body).toMatchObject({ take: 1, skip: 0 });
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0]).toMatchObject({ id: ownDelivery.id });
  });

  it('deactivates a driver to offline and prevents further availability changes', async () => {
    const deactivation = await request(app.getHttpServer())
      .patch(`/drivers/${driverProfileId}/activation`)
      .set('Authorization', `Bearer ${adminToken}`)
      .set('User-Agent', 'c04-admin-client/1.0')
      .send({ active: false, expectedVersion: driverVersion })
      .expect(200);
    expect(deactivation.body).toMatchObject({
      active: false,
      availability: DriverAvailability.OFFLINE,
      changed: true,
    });
    driverVersion = deactivation.body.version as number;

    await availabilityRequest(DriverAvailability.ONLINE, driverVersion).expect(
      403,
    );
    expect(
      await dataSource.getRepository(AuditLog).count({
        where: { action: 'driver.deactivate', entityId: driverProfileId },
      }),
    ).toBe(1);
  });
});

describe('C04 DriverProfile lifecycle migration', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;

  beforeAll(async () => {
    database = await createPostgisDatabase(
      entities,
      migrations.filter(
        (migration) => migration !== AddDriverCapabilityLifecycle1700000000012,
      ),
    );
  });

  afterAll(async () => {
    if (database) await database.close();
  });

  it('preserves legacy approval, normalizes inactive availability, and changes only future defaults', async () => {
    const source = database.dataSource;
    const users = source.getRepository(User);
    const [approvedUser, pendingUser, newUser] = await users.save([
      users.create({
        phone: '+96171080991',
        displayName: 'C04 legacy approved driver',
      }),
      users.create({
        phone: '+96171080992',
        displayName: 'C04 legacy pending driver',
      }),
      users.create({
        phone: '+96171080993',
        displayName: 'C04 post-migration driver',
      }),
    ]);
    await source.query(
      `INSERT INTO "driver_profiles" ("userId", "vehicleType", "availability", "active")
       VALUES ($1, 'car', 'online', true), ($2, 'motorcycle', 'online', false)`,
      [approvedUser.id, pendingUser.id],
    );

    const migration = new AddDriverCapabilityLifecycle1700000000012();
    await source.transaction(async (manager) => {
      await migration.up(manager.queryRunner!);
    });

    const legacyRows: Array<{
      userId: string;
      active: boolean;
      availability: DriverAvailability;
      version: number;
    }> = await source.query(
      `SELECT "userId", "active", "availability", "version"
       FROM "driver_profiles"
       WHERE "userId" IN ($1, $2)
       ORDER BY "userId"`,
      [approvedUser.id, pendingUser.id],
    );
    expect(legacyRows).toEqual(
      expect.arrayContaining([
        {
          userId: approvedUser.id,
          active: true,
          availability: DriverAvailability.ONLINE,
          version: 1,
        },
        {
          userId: pendingUser.id,
          active: false,
          availability: DriverAvailability.OFFLINE,
          version: 1,
        },
      ]),
    );

    const [newProfile]: Array<{
      active: boolean;
      availability: DriverAvailability;
      version: number;
    }> = await source.query(
      `INSERT INTO "driver_profiles" ("userId", "vehicleType")
       VALUES ($1, 'van')
       RETURNING "active", "availability", "version"`,
      [newUser.id],
    );
    expect(newProfile).toEqual({
      active: false,
      availability: DriverAvailability.OFFLINE,
      version: 1,
    });
    await expect(
      source.query(
        `UPDATE "driver_profiles" SET "availability" = 'online' WHERE "userId" = $1`,
        [newUser.id],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
