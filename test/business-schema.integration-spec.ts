import { globSync } from 'node:fs';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
import { BusinessesService } from '../src/modules/businesses/businesses.service';
import {
  BusinessMember,
  BusinessMemberRole,
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

describe('Business operations against the migrated PostGIS schema', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let module: TestingModule | undefined;
  let service: BusinessesService;

  beforeAll(async () => {
    database = await createPostgisDatabase(entities, migrations);
    const dataSource = database.dataSource;
    module = await Test.createTestingModule({
      providers: [
        { provide: DataSource, useValue: dataSource },
        {
          provide: getRepositoryToken(Business),
          useValue: dataSource.getRepository(Business),
        },
        {
          provide: getRepositoryToken(BusinessMember),
          useValue: dataSource.getRepository(BusinessMember),
        },
        {
          provide: BusinessesService,
          inject: [
            DataSource,
            getRepositoryToken(Business),
            getRepositoryToken(BusinessMember),
          ],
          useFactory: (
            source: DataSource,
            businesses: Repository<Business>,
            members: Repository<BusinessMember>,
          ) => new BusinessesService(source, businesses, members),
        },
      ],
    }).compile();
    service = module.get(BusinessesService);
  });

  afterAll(async () => {
    try {
      if (module) await module.close();
    } finally {
      if (database) await database.close();
    }
  });

  it('matches every mapped entity column to the actual migration schema', async () => {
    const dataSource = database.dataSource;
    const columns: { table_name: string; column_name: string }[] =
      await dataSource.query(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = ANY($1::text[])`,
        [dataSource.entityMetadatas.map((metadata) => metadata.tableName)],
      );

    expect(dataSource.entityMetadatas).toHaveLength(entities.length);
    expect(entities).toHaveLength(globSync('src/**/*.entity.ts').length);
    for (const metadata of dataSource.entityMetadatas) {
      for (const column of metadata.columns) {
        expect(
          column.databaseName,
          `${metadata.tableName}.${column.propertyName}`,
        ).toBe(column.propertyName);
      }
      const actual = columns
        .filter((column) => column.table_name === metadata.tableName)
        .map((column) => column.column_name)
        .sort();
      const mapped = metadata.columns
        .map((column) => column.databaseName)
        .sort();
      expect(mapped, metadata.tableName).toEqual(actual);
      // Exercise generated SELECTs too, not just metadata inspection.
      await dataSource.getRepository(metadata.target).find({
        take: 1,
        order: { id: 'ASC' },
      });
    }
  });

  it('creates, reads and updates settlement configuration in the existing SQL column', async () => {
    const dataSource = database.dataSource;
    const users = dataSource.getRepository(User);
    const owner = await users.save(
      users.create({ phone: '+96171000001', displayName: 'F01 owner' }),
    );
    const business = await service.create(owner.id, {
      name: 'F01 business',
      slug: 'f01-business',
      contactPhone: '+96171000001',
    });

    expect(business.settlementConfig).toEqual({});
    expect((await service.findById(business.id)).settlementConfig).toEqual({});
    expect((await service.findBySlug('f01-business')).id).toBe(business.id);
    expect(
      await service.findUserBusinesses(owner.id, { take: 20, skip: 0 }),
    ).toEqual([expect.objectContaining({ id: business.id, role: 'owner' })]);

    business.settlementConfig = {
      schedule: 'weekly',
      nested: { enabled: true },
    };
    await dataSource.getRepository(Business).save(business);
    expect((await service.findById(business.id)).settlementConfig).toEqual(
      business.settlementConfig,
    );
    const rows: { settlementConfig: Record<string, unknown> }[] =
      await dataSource.query(
        'SELECT "settlementConfig" FROM businesses WHERE id = $1',
        [business.id],
      );
    expect(rows[0].settlementConfig).toEqual(business.settlementConfig);
  });

  it('removes a member through the locked Business read and retains the last owner', async () => {
    const dataSource = database.dataSource;
    const users = dataSource.getRepository(User);
    const owner = await users.save(
      users.create({ phone: '+96171000002', displayName: 'F01 second owner' }),
    );
    const operator = await users.save(
      users.create({ phone: '+96171000003', displayName: 'F01 operator' }),
    );
    const business = await service.create(owner.id, {
      name: 'F01 membership business',
      slug: 'f01-membership-business',
      contactPhone: owner.phone,
    });
    const membership = await service.addMember(
      business.id,
      operator.id,
      BusinessMemberRole.OPERATOR,
      owner.id,
    );

    await service.removeMember(business.id, operator.id, owner.id);
    const removed = await dataSource.getRepository(BusinessMember).findOne({
      where: { id: membership.id },
      withDeleted: true,
    });
    expect(removed?.deletedAt).toBeInstanceOf(Date);
    expect(
      await service.findMembers(business.id, { take: 20, skip: 0 }),
    ).toEqual([
      expect.objectContaining({
        userId: owner.id,
        role: BusinessMemberRole.OWNER,
      }),
    ]);
    await expect(
      service.removeMember(business.id, owner.id, owner.id),
    ).rejects.toThrow('Cannot remove the last active owner');
    expect(
      await dataSource.getRepository(BusinessMember).findOneBy({
        businessId: business.id,
        userId: owner.id,
      }),
    ).not.toBeNull();
  });
});
