import { AddPricedSnapshots1700000000015 } from '../src/database/migrations/1700000000015-AddPricedSnapshots';
import { DeliveryFinancialSnapshot } from '../src/modules/finance/entities/delivery-financial-snapshot.entity';
import { AddImmutableLedger1700000000014 } from '../src/database/migrations/1700000000014-AddImmutableLedger';
import { LedgerEntry } from '../src/modules/finance/entities/ledger-entry.entity';
import { LedgerEvent } from '../src/modules/finance/entities/ledger-event.entity';
import { hash } from 'argon2';
import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
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
import { AdminRoleAssignment } from '../src/modules/users/entities/admin-role-assignment.entity';
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

describe('persistent delivery idempotency through the real HTTP pipeline', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let app: INestApplication;
  let appModule: TestingModule;
  let dataSource: DataSource;
  let user: User;
  let secondUser: User;
  let accessToken: string;
  let secondAccessToken: string;
  let originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string>>;
  let phoneCounter = 0;

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
    process.env.JWT_ACCESS_SECRET = 's04-integration-access-secret-value';
    process.env.JWT_REFRESH_SECRET = 's04-integration-refresh-secret-value';
    process.env.JWT_ACCESS_EXPIRATION = '15m';
    process.env.JWT_REFRESH_EXPIRATION = '14d';

    await bootApp();

    const users = dataSource.getRepository(User);
    user = await users.save(
      users.create({
        phone: nextPhone(),
        email: 's04-user-1@example.com',
        displayName: 'S04 User 1',
        passwordHash: await hash('s04-password-1'),
      }),
    );
    secondUser = await users.save(
      users.create({
        phone: nextPhone(),
        email: 's04-user-2@example.com',
        displayName: 'S04 User 2',
        passwordHash: await hash('s04-password-2'),
      }),
    );

    await dataSource.getRepository(PricingRule).save(
      dataSource.getRepository(PricingRule).create({
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
      }),
    );

    accessToken = await login('s04-user-1@example.com', 's04-password-1');
    secondAccessToken = await login('s04-user-2@example.com', 's04-password-2');
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    if (database) await database.close();
  });

  async function bootApp(): Promise<void> {
    const { AppModule } = await import('../src/app.module');
    appModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = appModule.createNestApplication();
    app.useGlobalPipes(appValidationPipe);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    dataSource = appModule.get(DataSource);
  }

  async function login(email: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login/password')
      .send({ email, password })
      .expect(200);
    return response.body.accessToken as string;
  }

  function nextPhone(): string {
    phoneCounter += 1;
    return `+96171${String(phoneCounter).padStart(6, '0')}`;
  }

  function deliveryBody(note = 'S04 idempotency delivery') {
    return {
      codAmount: '0',
      notes: note,
      recipient: {
        name: 'S04 Recipient',
        phone: nextPhone(),
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

  async function countUserDeliveries(userId: string): Promise<number> {
    return await database.dataSource
      .getRepository(Delivery)
      .count({ where: { createdByUserId: userId } });
  }

  it('passes the stage baseline before exercising idempotency', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/users/me').expect(401);
    const profile = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(profile.body.id).toBe(user.id);
  });

  it('replays the same response and rejects a same-key payload conflict', async () => {
    const idempotencyKey = randomUUID();
    const body = deliveryBody();
    const first = await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);

    const replay = await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);
    expect(replay.body).toEqual(first.body);

    await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send({ ...body, notes: 'different payload' })
      .expect(409);

    expect(await countUserDeliveries(user.id)).toBe(1);
  });

  it('keeps idempotency keys scoped to the authenticated actor', async () => {
    const idempotencyKey = randomUUID();
    const body = deliveryBody('actor-scoped');
    await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);

    await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${secondAccessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);

    expect(await countUserDeliveries(user.id)).toBe(2);
    expect(await countUserDeliveries(secondUser.id)).toBe(1);
  });

  it('serializes concurrent same-key creates into one replayable aggregate', async () => {
    const idempotencyKey = randomUUID();
    const body = deliveryBody('concurrent');
    const results = await Promise.all([
      request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body),
      request(app.getHttpServer())
        .post('/deliveries')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', idempotencyKey)
        .send(body),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([201, 201]);
    expect(results[0].body).toEqual(results[1].body);
    expect(await countUserDeliveries(user.id)).toBe(3);
  });

  it('replays persisted responses after the application restarts', async () => {
    const idempotencyKey = randomUUID();
    const body = deliveryBody('restart');
    const first = await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);

    await app.close();
    await bootApp();
    accessToken = await login('s04-user-1@example.com', 's04-password-1');

    const replay = await request(app.getHttpServer())
      .post('/deliveries')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(body)
      .expect(201);
    expect(replay.body).toEqual(first.body);
    expect(await countUserDeliveries(user.id)).toBe(4);
  });
});
