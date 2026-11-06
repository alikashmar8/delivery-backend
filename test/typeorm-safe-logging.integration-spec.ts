import { DataSource } from 'typeorm';
import { InitExtensionsAndEnums1700000000000 } from '../src/database/migrations/1700000000000-InitExtensionsAndEnums';
import { CreateIdentityTables1700000000001 } from '../src/database/migrations/1700000000001-CreateIdentityTables';
import { CreateBusinessTables1700000000002 } from '../src/database/migrations/1700000000002-CreateBusinessTables';
import { CreateGeoPricingTables1700000000003 } from '../src/database/migrations/1700000000003-CreateGeoPricingTables';
import { SeedLebanonRegions1700000000004 } from '../src/database/migrations/1700000000004-SeedLebanonRegions';
import { CreateDeliveryCore1700000000005 } from '../src/database/migrations/1700000000005-CreateDeliveryCore';
import { StabilizePhasesZeroToFour1700000000006 } from '../src/database/migrations/1700000000006-StabilizePhasesZeroToFour';
import { UseCamelCaseColumns1700000000007 } from '../src/database/migrations/1700000000007-UseCamelCaseColumns';
import { Address } from '../src/modules/addresses/entities/address.entity';
import { BusinessMember } from '../src/modules/businesses/entities/business-member.entity';
import { Business } from '../src/modules/businesses/entities/business.entity';
import { SafeTypeOrmLogger } from '../src/database/safe-typeorm-logger';
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
];

const SECRET_VALUE =
  'super-secret-token-hash-must-never-appear-in-logs-9f8e7d6c';

describe('SafeTypeOrmLogger against the migrated PostGIS schema', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let dataSource: DataSource;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    database = await createPostgisDatabase(entities, migrations, {
      logging: true,
      logger: new SafeTypeOrmLogger(),
    });
    dataSource = database.dataSource;
  });

  afterAll(async () => {
    if (database) await database.close();
  });

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });

  function allLoggedText(): string {
    return [...logSpy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .flat()
      .map((value) => String(value))
      .join('\n');
  }

  it('never logs a secret query parameter on INSERT, SELECT or a failing query', async () => {
    const users = dataSource.getRepository(User);
    const user = await users.save(
      users.create({ phone: '+96171099001', displayName: 'F03 user' }),
    );

    const refreshTokens = dataSource.getRepository(RefreshToken);
    await refreshTokens.save(
      refreshTokens.create({
        userId: user.id,
        tokenHash: SECRET_VALUE,
        expiresAt: new Date(Date.now() + 60_000),
      }),
    );
    await refreshTokens.findOne({ where: { tokenHash: SECRET_VALUE } });

    // A failing query (duplicate primary key style violation) must not leak the value either.
    await expect(
      dataSource.query(
        'INSERT INTO refresh_tokens (id, "userId", "tokenHash", "expiresAt") VALUES ($1, $2, $3, now())',
        ['not-a-uuid', user.id, SECRET_VALUE],
      ),
    ).rejects.toThrow();

    expect(logSpy).toHaveBeenCalled();
    const logged = allLoggedText();
    expect(logged).not.toContain(SECRET_VALUE);
    // Query text itself (not parameters) is still logged for diagnostics.
    expect(logged).toMatch(
      /INSERT INTO "refresh_tokens"|INSERT INTO refresh_tokens/,
    );
  });
});
