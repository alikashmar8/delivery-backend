import { hash } from 'argon2';
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
import { Address } from '../src/modules/addresses/entities/address.entity';
import { AuditLog } from '../src/modules/audit/entities/audit-log.entity';
import {
  BusinessMember,
  BusinessMemberRole,
} from '../src/modules/businesses/entities/business-member.entity';
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

describe('S05 administration audit through the real HTTP pipeline', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let app: INestApplication;
  let moduleRef: TestingModule;
  let dataSource: DataSource;
  let actor: User;
  let target: User;
  let accessToken: string;
  let business: Business;
  let targetMembership: BusinessMember;
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
    process.env.JWT_ACCESS_SECRET = 's05-integration-access-secret-value';
    process.env.JWT_REFRESH_SECRET = 's05-integration-refresh-secret-value';
    process.env.JWT_ACCESS_EXPIRATION = '15m';
    process.env.JWT_REFRESH_EXPIRATION = '14d';

    const { AppModule } = await import('../src/app.module');
    moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(appValidationPipe);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    dataSource = moduleRef.get(DataSource);

    const users = dataSource.getRepository(User);
    actor = await users.save(
      users.create({
        phone: '+96171050001',
        email: 's05-actor@example.com',
        displayName: 'S05 actor',
        passwordHash: await hash('s05-actor-password'),
      }),
    );
    target = await users.save(
      users.create({
        phone: '+96171050002',
        email: 's05-target@example.com',
        displayName: 'S05 target',
        passwordHash: await hash('s05-target-password'),
      }),
    );
    await dataSource.getRepository(AdminRoleAssignment).save({
      userId: actor.id,
      role: AdminRole.ADMIN,
      active: true,
      grantedById: actor.id,
    });
    business = await dataSource.getRepository(Business).save({
      name: 'S05 business',
      slug: `s05-${Date.now()}`,
      contactPhone: actor.phone,
    });
    await dataSource.getRepository(BusinessMember).save({
      businessId: business.id,
      userId: actor.id,
      role: BusinessMemberRole.OWNER,
    });
    targetMembership = await dataSource.getRepository(BusinessMember).save({
      businessId: business.id,
      userId: target.id,
      role: BusinessMemberRole.OPERATOR,
    });
    accessToken = await login();
  });

  afterAll(async () => {
    if (app) await app.close();
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
    if (database) await database.close();
  });

  async function login(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login/password')
      .send({ email: actor.email, password: 's05-actor-password' })
      .expect(200);
    return response.body.accessToken as string;
  }

  it('passes health, unauthenticated denial, authenticated access and correlation IDs', async () => {
    await request(app.getHttpServer()).get('/health').expect(200);
    await request(app.getHttpServer()).get('/users/me').expect(401);

    const requestId = 's05-correlation-id';
    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Request-ID', requestId)
      .expect(200);
    expect(response.body.id).toBe(actor.id);
  });

  it('records pricing audit metadata and excludes credential fields', async () => {
    const response = await request(app.getHttpServer())
      .post('/pricing-rules')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('User-Agent', 's05-integration-client/1.0')
      .send({ baseFee: '500', currency: 'USD' })
      .expect(201);

    const audit = await dataSource.getRepository(AuditLog).findOneOrFail({
      where: { action: 'pricing.create', entityId: response.body.id },
    });
    expect(audit.ipAddress).toBeTruthy();
    expect(audit.userAgent).toBe('s05-integration-client/1.0');
    expect(JSON.stringify(audit.after)).not.toContain('passwordHash');
  });

  it('records member removal audit metadata atomically', async () => {
    await request(app.getHttpServer())
      .delete(`/businesses/${business.id}/members/${target.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('User-Agent', 's05-member-client/1.0')
      .expect(200);

    const audit = await dataSource.getRepository(AuditLog).findOneOrFail({
      where: { action: 'member.remove', entityId: targetMembership.id },
    });
    expect(audit.ipAddress).toBeTruthy();
    expect(audit.userAgent).toBe('s05-member-client/1.0');
    expect(audit.before).toMatchObject({
      businessId: business.id,
      userId: target.id,
      role: BusinessMemberRole.OPERATOR,
    });
    expect(JSON.stringify(audit.before)).not.toContain('passwordHash');
  });

  it('maps duplicate business slugs to a correlated conflict envelope', async () => {
    const requestId = 's05-conflict-id';
    const response = await request(app.getHttpServer())
      .post('/businesses')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('X-Request-ID', requestId)
      .send({
        name: 'Duplicate S05 business',
        slug: business.slug,
        contactPhone: actor.phone,
      })
      .expect(409);

    expect(response.headers['x-request-id']).toBe(requestId);
    expect(response.body).toMatchObject({
      error: {
        code: 'CONFLICT',
        requestId,
      },
    });
    expect(typeof response.body.error.message).toBe('string');
  });

  it('does not write an audit row when last-owner removal is rejected', async () => {
    const soloBusiness = await dataSource.getRepository(Business).save({
      name: 'S05 solo business',
      slug: `s05-solo-${Date.now()}`,
      contactPhone: actor.phone,
    });
    const soloMembership = await dataSource.getRepository(BusinessMember).save({
      businessId: soloBusiness.id,
      userId: actor.id,
      role: BusinessMemberRole.OWNER,
    });
    const before = await dataSource.getRepository(AuditLog).count({
      where: { action: 'member.remove', entityId: soloMembership.id },
    });

    await request(app.getHttpServer())
      .delete(`/businesses/${soloBusiness.id}/members/${actor.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);

    const after = await dataSource.getRepository(AuditLog).count({
      where: { action: 'member.remove', entityId: soloMembership.id },
    });
    expect(after).toBe(before);
  });
});
