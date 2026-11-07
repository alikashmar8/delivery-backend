import { AddPricedSnapshots1700000000015 } from '../src/database/migrations/1700000000015-AddPricedSnapshots';
import { DeliveryFinancialSnapshot } from '../src/modules/finance/entities/delivery-financial-snapshot.entity';
import { AddImmutableLedger1700000000014 } from '../src/database/migrations/1700000000014-AddImmutableLedger';
import { LedgerEntry } from '../src/modules/finance/entities/ledger-entry.entity';
import { LedgerEvent } from '../src/modules/finance/entities/ledger-event.entity';
import { setTimeout as sleep } from 'node:timers/promises';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
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
import { AuthService } from '../src/modules/auth/auth.service';
import { MemoryOtpProvider } from '../src/modules/auth/otp/otp-provider';
import { MemoryOtpState } from '../src/modules/auth/otp/otp-state';
import { BusinessMember } from '../src/modules/businesses/entities/business-member.entity';
import { Business } from '../src/modules/businesses/entities/business.entity';
import { DeliveryAddress } from '../src/modules/deliveries/entities/delivery-address.entity';
import { DeliveryStatusHistory } from '../src/modules/deliveries/entities/delivery-status-history.entity';
import { Delivery } from '../src/modules/deliveries/entities/delivery.entity';
import { Recipient } from '../src/modules/deliveries/entities/recipient.entity';
import { PricingRule } from '../src/modules/pricing/entities/pricing-rule.entity';
import { Region } from '../src/modules/regions/entities/region.entity';
import { AdminRoleAssignment } from '../src/modules/users/entities/admin-role-assignment.entity';
import { DriverCompensationPlan } from '../src/modules/finance/entities/driver-compensation-plan.entity';
import { DriverPlanAssignment } from '../src/modules/finance/entities/driver-plan-assignment.entity';
import { DriverProfile } from '../src/modules/users/entities/driver-profile.entity';
import { RefreshToken } from '../src/modules/users/entities/refresh-token.entity';
import { User, UserStatus } from '../src/modules/users/entities/user.entity';
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

function fakeConfig(): ConfigService {
  const values: Record<string, string> = {
    'jwt.accessSecret': 'test-access-secret',
    'jwt.accessExpiration': '15m',
    'jwt.refreshSecret': 'test-refresh-secret',
    'jwt.refreshExpiration': '14d',
  };
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (!value) throw new Error(`missing config ${key}`);
      return value;
    },
  } as unknown as ConfigService;
}

describe('Refresh token locking against the migrated PostGIS schema', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let dataSource: DataSource;
  let service: AuthService;
  let userCounter = 0;

  beforeAll(async () => {
    database = await createPostgisDatabase(entities, migrations);
    dataSource = database.dataSource;
    service = new AuthService(
      fakeConfig(),
      new JwtService(),
      dataSource,
      dataSource.getRepository(User),
      dataSource.getRepository(RefreshToken),
      new MemoryOtpProvider(),
      new MemoryOtpState(),
    );
  });

  afterAll(async () => {
    if (database) await database.close();
  });

  async function createActiveUser(status: UserStatus = UserStatus.ACTIVE) {
    userCounter += 1;
    return await dataSource.getRepository(User).save(
      dataSource.getRepository(User).create({
        phone: `+9617100${String(1000 + userCounter).padStart(4, '0')}`,
        displayName: `F02 user ${userCounter}`,
        status,
      }),
    );
  }

  async function issueRefreshToken(userId: string) {
    const tokens = await (
      service as unknown as {
        issueTokens: (
          user: User,
        ) => Promise<{ refreshToken: string; accessToken: string }>;
      }
    ).issueTokens(
      (await dataSource
        .getRepository(User)
        .findOneByOrFail({ id: userId })) as User,
    );
    return tokens.refreshToken;
  }

  it('rotates a valid refresh token: old token revoked, new token works', async () => {
    const user = await createActiveUser();
    const refreshToken = await issueRefreshToken(user.id);

    const rotated = await service.refreshTokens(refreshToken);
    expect(rotated.refreshToken).not.toBe(refreshToken);
    expect(rotated.accessToken).toBeTruthy();

    const oldHash = (
      service as unknown as { hashToken: (v: string) => string }
    ).hashToken(refreshToken);
    const oldRow = await dataSource
      .getRepository(RefreshToken)
      .findOneByOrFail({ tokenHash: oldHash });
    expect(oldRow.revokedAt).not.toBeNull();

    // The new token itself must be usable for a further rotation.
    const rotatedAgain = await service.refreshTokens(rotated.refreshToken);
    expect(rotatedAgain.refreshToken).not.toBe(rotated.refreshToken);
  });

  it('rejects an unknown refresh token', async () => {
    await expect(service.refreshTokens('not-a-real-token')).rejects.toThrow(
      'Invalid refresh token',
    );
  });

  it('rejects a reused (already revoked) refresh token', async () => {
    const user = await createActiveUser();
    const refreshToken = await issueRefreshToken(user.id);
    await service.refreshTokens(refreshToken);

    await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
      'Invalid refresh token',
    );
  });

  it('rejects an expired refresh token', async () => {
    const user = await createActiveUser();
    const refreshToken = await issueRefreshToken(user.id);
    const hash = (
      service as unknown as { hashToken: (v: string) => string }
    ).hashToken(refreshToken);
    await dataSource
      .getRepository(RefreshToken)
      .update({ tokenHash: hash }, { expiresAt: new Date(Date.now() - 1000) });

    await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
      'Refresh token expired',
    );
  });

  it('rejects a refresh token for a non-active user', async () => {
    const user = await createActiveUser(UserStatus.SUSPENDED);
    const refreshToken = await issueRefreshToken(user.id);

    await expect(service.refreshTokens(refreshToken)).rejects.toThrow(
      'Account is not active',
    );
  });

  it('allows exactly one of two concurrent refreshes of the same token to succeed', async () => {
    const user = await createActiveUser();
    const refreshToken = await issueRefreshToken(user.id);

    const results = await Promise.allSettled([
      service.refreshTokens(refreshToken),
      service.refreshTokens(refreshToken),
    ]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe(
      'Invalid refresh token',
    );
  });

  it('locks only the refresh_tokens row, not the joined users row', async () => {
    const user = await createActiveUser();
    const refreshToken = await issueRefreshToken(user.id);
    const hash = (
      service as unknown as { hashToken: (v: string) => string }
    ).hashToken(refreshToken);

    const holder = dataSource.createQueryRunner();
    await holder.connect();
    await holder.startTransaction();
    try {
      // Mirror the exact locked read used by AuthService.refreshTokens.
      await holder.manager.getRepository(RefreshToken).findOne({
        where: { tokenHash: hash },
        lock: { mode: 'pessimistic_write' },
      });

      // While the refresh-token row is locked and uncommitted, an unrelated
      // update to the same user's row must not be blocked by that lock.
      const concurrentUserUpdate = dataSource
        .getRepository(User)
        .update(user.id, { displayName: 'concurrent update ok' });

      const outcome = await Promise.race([
        concurrentUserUpdate.then(() => 'completed' as const),
        sleep(3000).then(() => 'timed-out' as const),
      ]);
      expect(outcome).toBe('completed');
    } finally {
      await holder.rollbackTransaction();
      await holder.release();
    }
  });
});
