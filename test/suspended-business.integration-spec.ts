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
import {
  Business,
  BusinessStatus,
} from '../src/modules/businesses/entities/business.entity';
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

describe('S02 suspended-business eligibility over real HTTP', () => {
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
    process.env.JWT_ACCESS_SECRET = 's02-access-secret-value';
    process.env.JWT_REFRESH_SECRET = 's02-refresh-secret-value';
    process.env.JWT_ACCESS_EXPIRATION = '15m';
    process.env.JWT_REFRESH_EXPIRATION = '14d';

    const { AppModule } = await import('../src/app.module');
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(appValidationPipe);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
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

  async function seedUser(password: string) {
    userCounter += 1;
    const email = `s02-user-${userCounter}-${Date.now()}@example.com`;
    const users = dataSource.getRepository(User);
    const user = await users.save(
      users.create({
        phone: `+96171${String(200000 + userCounter).padStart(6, '0')}`,
        email,
        displayName: `S02 user ${userCounter}`,
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
    return response.body as { accessToken: string };
  }

  it('allows reads but denies mutations for a suspended business', async () => {
    const ownerPassword = 's02-owner-password-1';
    const operatorPassword = 's02-operator-password-1';
    const outsiderPassword = 's02-outsider-password-1';
    const { user: owner } = await seedUser(ownerPassword);
    const { user: operator } = await seedUser(operatorPassword);
    const { email: ownerEmail } = { email: owner.email } as {
      email: string;
    };
    // seedUser returns generated emails; re-read them from DB rows.
    const ownerRow = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: owner.id });
    const operatorRow = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: operator.id });
    const { user: outsider } = await seedUser(outsiderPassword);
    const outsiderRow = await dataSource
      .getRepository(User)
      .findOneByOrFail({ id: outsider.id });

    const ownerTokens = await loginAs(ownerRow.email!, ownerPassword);
    const outsiderTokens = await loginAs(outsiderRow.email!, outsiderPassword);

    const created = await request(app.getHttpServer())
      .post('/businesses')
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .send({
        name: 'S02 Biz',
        slug: `s02-biz-${Date.now()}`,
        contactPhone: ownerRow.phone,
      })
      .expect(201);
    const businessId = created.body.id as string;

    // Seed a second member directly (no public add-member route yet).
    const members = dataSource.getRepository(BusinessMember);
    await members.save(
      members.create({
        businessId,
        userId: operatorRow.id,
        role: BusinessMemberRole.OPERATOR,
        status: BusinessMemberStatus.ACTIVE,
      }),
    );

    // Sanity: mutations work while ACTIVE.
    await request(app.getHttpServer())
      .post('/pricing-rules')
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .send({ businessId, baseFee: '500' })
      .expect(201);

    // Suspend via direct status update (no public suspend route).
    await dataSource
      .getRepository(Business)
      .update({ id: businessId }, { status: BusinessStatus.SUSPENDED });

    // Reads stay available for members.
    await request(app.getHttpServer())
      .get(`/businesses/${businessId}`)
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get(`/businesses/${businessId}/members`)
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/deliveries')
      .query({ businessId, take: 20, skip: 0 })
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/pricing-rules')
      .query({ businessId, take: 20, skip: 0 })
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/delivery-zones')
      .query({ businessId, take: 20, skip: 0 })
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .expect(200);

    // Mutations are denied with 403.
    await request(app.getHttpServer())
      .delete(`/businesses/${businessId}/members/${operatorRow.id}`)
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .expect(403);

    await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .send({
        businessId,
        codAmount: '0',
        recipient: {
          name: 'Recipient',
          phone: '+96171111111',
          city: 'Beirut',
          latitude: 33.9,
          longitude: 35.5,
        },
        pickupAddress: {
          city: 'Beirut',
          latitude: 33.9,
          longitude: 35.5,
        },
      })
      .expect(403);

    await request(app.getHttpServer())
      .post('/pricing-rules')
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .send({ businessId, baseFee: '600' })
      .expect(403);

    await request(app.getHttpServer())
      .post('/pricing-rules/compute')
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .send({ businessId })
      .expect(403);

    await request(app.getHttpServer())
      .post('/delivery-zones')
      .set('Authorization', `Bearer ${ownerTokens.accessToken}`)
      .send({
        businessId,
        name: 'S02 zone',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [35.4, 33.8],
              [35.6, 33.8],
              [35.6, 34.0],
              [35.4, 34.0],
              [35.4, 33.8],
            ],
          ],
        },
      })
      .expect(403);

    // Cross-tenant access is still denied (404, no oracle).
    await request(app.getHttpServer())
      .get(`/businesses/${businessId}`)
      .set('Authorization', `Bearer ${outsiderTokens.accessToken}`)
      .expect(404);

    // Suppress unused vars for lint.
    expect(ownerEmail).toBeDefined();
  });
});
