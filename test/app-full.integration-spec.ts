import { hash } from 'argon2';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
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
import { Address } from '../src/modules/addresses/entities/address.entity';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { IdempotencyKey } from '../src/modules/idempotency/entities/idempotency-key.entity';
import {
  BusinessMember,
  BusinessMemberRole,
  BusinessMemberStatus,
} from '../src/modules/businesses/entities/business-member.entity';
import { Business } from '../src/modules/businesses/entities/business.entity';
import { DeliveryAddress } from '../src/modules/deliveries/entities/delivery-address.entity';
import { DeliveryStatusHistory } from '../src/modules/deliveries/entities/delivery-status-history.entity';
import { Delivery } from '../src/modules/deliveries/entities/delivery.entity';
import { Recipient } from '../src/modules/deliveries/entities/recipient.entity';
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

// Env vars the real AppModule/DatabaseModule/ConfigModule read at compile time.
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

describe('Full AppModule against the migrated PostGIS schema', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let app: INestApplication;
  let dataSource: DataSource;
  let originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string>>;
  let userCounter = 0;

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
    process.env.JWT_ACCESS_SECRET = 'f04-integration-access-secret-value';
    process.env.JWT_REFRESH_SECRET = 'f04-integration-refresh-secret-value';
    process.env.JWT_ACCESS_EXPIRATION = '15m';
    process.env.JWT_REFRESH_EXPIRATION = '14d';

    // AppModule's ConfigModule.forRoot(...) runs validateEnvironment synchronously
    // at module-decoration time, so it must be imported only after env is set.
    const { AppModule } = await import('../src/app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(appValidationPipe);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    // The AppModule's own DataSource — same physical DB as the helper's, over a
    // separate connection, exactly as a real deployed client connection would be.
    dataSource = moduleRef.get(DataSource);
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    if (database) await database.close();
  });

  async function seedActiveUser(password: string) {
    userCounter += 1;
    const email = `f04-user-${userCounter}@example.com`;
    const users = dataSource.getRepository(User);
    const user = await users.save(
      users.create({
        phone: `+9617${String(1200000 + userCounter)}`,
        email,
        displayName: `F04 user ${userCounter}`,
        passwordHash: await hash(password),
      }),
    );
    return { user, email };
  }

  async function loginAs(email: string, password: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/login/password')
      .send({ email, password })
      .expect(200);
    return response.body as { accessToken: string; refreshToken: string };
  }

  it('logs in, rotates refresh tokens, and rejects reuse through the real HTTP pipeline', async () => {
    const password = 'correct-horse-battery-staple';
    const { email } = await seedActiveUser(password);

    const login = await request(app.getHttpServer())
      .post('/auth/login/password')
      .send({ email, password })
      .expect(200);
    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.refreshToken).toBeTruthy();
    expect(login.body.user).not.toHaveProperty('passwordHash');

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);
    expect(refreshed.body.refreshToken).not.toBe(login.body.refreshToken);

    // Reused (revoked) refresh token must be rejected over real HTTP (F02 fix).
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(401);
  });

  it('creates a business through a real transaction and enforces tenant scope', async () => {
    const ownerPassword = 'owner-strong-password-1';
    const outsiderPassword = 'outsider-strong-password-1';
    const { user: owner } = await seedActiveUser(ownerPassword);
    await seedActiveUser(outsiderPassword);
    const ownerEmail = `f04-user-${userCounter - 1}@example.com`;
    const outsiderEmail = `f04-user-${userCounter}@example.com`;

    const ownerTokens = await loginAs(ownerEmail, ownerPassword);
    const outsiderTokens = await loginAs(outsiderEmail, outsiderPassword);

    const created = await request(app.getHttpServer())
      .post('/businesses')
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .send({
        name: 'F04 Biz',
        slug: `f04-biz-${Date.now()}`,
        contactPhone: owner.phone,
      })
      .expect(201);
    const businessId = created.body.id as string;

    await request(app.getHttpServer())
      .get(`/businesses/${businessId}`)
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .expect(200);
    // Real BusinessScopeGuard denies a non-member over the real HTTP pipeline.
    await request(app.getHttpServer())
      .get(`/businesses/${businessId}`)
      .set('Authorization', `Bearer ${outsiderTokens.accessToken}`)
      .expect(404);

    const members = await request(app.getHttpServer())
      .get(`/businesses/${businessId}/members`)
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .expect(200);
    expect(members.body.items).toHaveLength(1);
    expect(members.body.items[0]).toMatchObject({ role: 'owner' });
  });

  it('rolls back the owner-membership insert when business creation fails on a duplicate slug', async () => {
    const firstPassword = 'rollback-strong-password-1';
    const secondPassword = 'rollback-strong-password-2';
    const { user: firstOwner } = await seedActiveUser(firstPassword);
    const firstEmail = `f04-user-${userCounter}@example.com`;
    const { user: secondOwner } = await seedActiveUser(secondPassword);
    const secondEmail = `f04-user-${userCounter}@example.com`;

    const firstTokens = await loginAs(firstEmail, firstPassword);
    const secondTokens = await loginAs(secondEmail, secondPassword);

    const slug = `f04-rollback-${Date.now()}`;
    await request(app.getHttpServer())
      .post('/businesses')
      .set('Authorization', `Bearer ${firstTokens.accessToken}`)
      .send({ name: 'First', slug, contactPhone: firstOwner.phone })
      .expect(201);

    await request(app.getHttpServer())
      .post('/businesses')
      .set('Authorization', `Bearer ${secondTokens.accessToken}`)
      .send({
        name: 'Second (duplicate slug)',
        slug,
        contactPhone: secondOwner.phone,
      })
      .expect(409);

    // The failed transaction must not have left a dangling owner membership.
    const dangling = await dataSource
      .getRepository(BusinessMember)
      .findOneBy({ userId: secondOwner.id });
    expect(dangling).toBeNull();
  });

  it('serializes two concurrent removals racing for the last-owner protection under a real DB lock', async () => {
    const password = 'lock-test-password-1';
    const { user: ownerA } = await seedActiveUser(password);
    const ownerAEmail = `f04-user-${userCounter}@example.com`;
    const { user: ownerB } = await seedActiveUser('lock-test-password-2');

    const ownerATokens = await loginAs(ownerAEmail, password);

    const created = await request(app.getHttpServer())
      .post('/businesses')
      .set('Authorization', `Bearer ${ownerATokens.accessToken}`)
      .send({
        name: 'Lock Biz',
        slug: `f04-lock-${Date.now()}`,
        contactPhone: ownerA.phone,
      })
      .expect(201);
    const businessId = created.body.id as string;

    // No add-owner endpoint exists yet; seed the second owner directly.
    const members = dataSource.getRepository(BusinessMember);
    await members.save(
      members.create({
        businessId,
        userId: ownerB.id,
        role: BusinessMemberRole.OWNER,
        status: BusinessMemberStatus.ACTIVE,
      }),
    );

    const results = await Promise.allSettled([
      request(app.getHttpServer())
        .delete(`/businesses/${businessId}/members/${ownerB.id}`)
        .set('Authorization', `Bearer ${ownerATokens.accessToken}`),
      request(app.getHttpServer())
        .delete(`/businesses/${businessId}/members/${ownerA.id}`)
        .set('Authorization', `Bearer ${ownerATokens.accessToken}`),
    ]);

    const statuses = results.map((settled) =>
      settled.status === 'fulfilled' ? settled.value.status : -1,
    );
    // The pessimistic lock on the Business row serializes the race: exactly one
    // removal succeeds while two owners exist, the other sees the last-owner guard.
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 403)).toHaveLength(1);
  });

  it("validates the stabilization migration's NOT VALID constraints on a clean database", async () => {
    const rows: { conname: string; convalidated: boolean }[] =
      await dataSource.query(
        `SELECT conname, convalidated FROM pg_constraint WHERE conname LIKE 'chk_%' ORDER BY conname`,
      );
    expect(rows.length).toBeGreaterThanOrEqual(18);
    expect(rows.filter((row) => !row.convalidated)).toEqual([]);
  });
});
