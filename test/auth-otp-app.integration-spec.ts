import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
import { Address } from '../src/modules/addresses/entities/address.entity';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import { IdempotencyKey } from '../src/modules/idempotency/entities/idempotency-key.entity';
import { BusinessMember } from '../src/modules/businesses/entities/business-member.entity';
import { Business } from '../src/modules/businesses/entities/business.entity';
import { DeliveryAddress } from '../src/modules/deliveries/entities/delivery-address.entity';
import { DeliveryStatusHistory } from '../src/modules/deliveries/entities/delivery-status-history.entity';
import { Delivery } from '../src/modules/deliveries/entities/delivery.entity';
import { Recipient } from '../src/modules/deliveries/entities/recipient.entity';
import {
  MemoryOtpProvider,
  OTP_PROVIDER,
} from '../src/modules/auth/otp/otp-provider';
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

describe('OTP authentication through the real AppModule', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let app: INestApplication;
  let dataSource: DataSource;
  let otpProvider: MemoryOtpProvider;
  let originalEnv: Partial<Record<(typeof ENV_KEYS)[number], string>>;
  let phoneCounter = 0;

  function nextPhone(): string {
    phoneCounter += 1;
    // 71 is a valid Lebanese mobile prefix for IsPhoneNumber validation.
    return `+96171${String(10000 + phoneCounter).padStart(6, '0')}`;
  }

  async function sentCode(phone: string): Promise<string> {
    await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone })
      .expect(201);
    const recorded = otpProvider.lastSentTo(phone);
    expect(recorded?.code).toMatch(/^\d{6}$/);
    return recorded!.code;
  }

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
    process.env.JWT_ACCESS_SECRET = 's01-integration-access-secret-value';
    process.env.JWT_REFRESH_SECRET = 's01-integration-refresh-secret-value';
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
    otpProvider = moduleRef.get<MemoryOtpProvider>(OTP_PROVIDER);
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    if (database) await database.close();
  });

  it('logs in a returning user with a dispatched OTP', async () => {
    const phone = nextPhone();
    const users = dataSource.getRepository(User);
    await users.save(
      users.create({
        phone,
        email: null,
        displayName: 'Returning User',
        passwordHash: null,
      }),
    );

    const code = await sentCode(phone);
    const login = await request(app.getHttpServer())
      .post('/auth/login/otp')
      .send({ phone, code })
      .expect(200);

    expect(login.body.accessToken).toBeTruthy();
    expect(login.body.refreshToken).toBeTruthy();
    expect(login.body.user).toMatchObject({ phone });
    expect(login.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(login.body)).not.toContain(code);

    // The single-use challenge is gone: the same code no longer works.
    await request(app.getHttpServer())
      .post('/auth/login/otp')
      .send({ phone, code })
      .expect(401);
  });

  it('rejects OTP login for a phone with no account', async () => {
    const phone = nextPhone();
    const code = await sentCode(phone);
    const response = await request(app.getHttpServer())
      .post('/auth/login/otp')
      .send({ phone, code })
      .expect(401);
    expect(response.body.error.message).toBe('Invalid credentials');
  });

  it('rejects malformed OTP payloads before touching state', async () => {
    await request(app.getHttpServer())
      .post('/auth/login/otp')
      .send({ phone: '+96170000000' })
      .expect(400);
    await request(app.getHttpServer())
      .post('/auth/login/otp')
      .send({ phone: 'not-a-phone', code: '123456' })
      .expect(400);
  });

  it('registers with a direct OTP code and rejects duplicate phones', async () => {
    const phone = nextPhone();
    const code = await sentCode(phone);
    const registered = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ phone, otpCode: code, displayName: 'Fresh User' })
      .expect(201);
    expect(registered.body.accessToken).toBeTruthy();

    const retryCode = await sentCode(phone);
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ phone, otpCode: retryCode, displayName: 'Duplicate' })
      .expect(409);
  });

  it('fails closed with 503 when provider delivery fails', async () => {
    const phone = nextPhone();
    otpProvider.failNext('vendor circuit open');

    const response = await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone })
      .expect(503);
    expect(response.body.error.message).toBe('vendor circuit open');
    expect(otpProvider.lastSentTo(phone)).toBeUndefined();

    // Nothing was stored: any code for this phone is unknown.
    await request(app.getHttpServer())
      .post('/auth/login/otp')
      .send({ phone, code: '123456' })
      .expect(401);
  });

  it('keeps membership-gated reads intact for OTP-logged-in users', async () => {
    const phone = nextPhone();
    const users = dataSource.getRepository(User);
    const user = await users.save(
      users.create({
        phone,
        email: null,
        displayName: 'Member User',
        passwordHash: null,
      }),
    );
    const members = dataSource.getRepository(BusinessMember);
    expect(await members.findOneBy({ userId: user.id })).toBeNull();

    const code = await sentCode(phone);
    const login = await request(app.getHttpServer())
      .post('/auth/login/otp')
      .send({ phone, code })
      .expect(200);

    // A user with no memberships sees an empty business list, not an error.
    const mine = await request(app.getHttpServer())
      .get('/businesses/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(mine.body.items).toEqual([]);
  });
});
