import { randomUUID } from 'node:crypto';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { haversineKm, roundDistanceKm } from '../src/common/geo/distance';
import {
  decimalToScaled,
  multiplyAndRoundHalfUp,
} from '../src/common/money/money';
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
import { BusinessesService } from '../src/modules/businesses/businesses.service';
import { Business } from '../src/modules/businesses/entities/business.entity';
import { BusinessMember } from '../src/modules/businesses/entities/business-member.entity';
import { DeliveriesService } from '../src/modules/deliveries/deliveries.service';
import { toDeliveryResponse } from '../src/modules/deliveries/dto/delivery-response.dto';
import { DeliveryAddress } from '../src/modules/deliveries/entities/delivery-address.entity';
import { DeliveryStatusHistory } from '../src/modules/deliveries/entities/delivery-status-history.entity';
import { Delivery } from '../src/modules/deliveries/entities/delivery.entity';
import { Recipient } from '../src/modules/deliveries/entities/recipient.entity';
import { IdempotencyKey } from '../src/modules/idempotency/entities/idempotency-key.entity';
import { PricingService } from '../src/modules/pricing/pricing.service';
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
import { ZonesService } from '../src/modules/zones/zones.service';
import { createPostgisDatabase } from './helpers/postgis-database';

/**
 * C01: trusted reproducible pricing against real PostGIS (A07).
 * Covers: haversine floor enforcement, persisted quote provenance,
 * reproducibility after rule changes, and zone/rule selection
 * (boundary coverage, business-over-platform ties, tenant scope,
 * currency mismatch, effective-date filtering).
 */
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

// Beirut-ish test square (GeoJSON uses [lng, lat] order).
const SQUARE = {
  type: 'Polygon',
  coordinates: [
    [
      [35.4, 33.85],
      [35.6, 33.85],
      [35.6, 33.95],
      [35.4, 33.95],
      [35.4, 33.85],
    ],
  ],
};
const INSIDE = { latitude: 33.9, longitude: 35.5 };
const PICKUP = { latitude: 33.92, longitude: 35.55 };
const ON_EDGE = { latitude: 33.9, longitude: 35.4 };

function uniquePhone(): string {
  return `+${randomUUID().replace(/\D/g, '').slice(0, 15)}`;
}

describe('Trusted reproducible pricing against real PostGIS', () => {
  let database: Awaited<ReturnType<typeof createPostgisDatabase>>;
  let module: TestingModule | undefined;
  let businesses: BusinessesService;
  let zones: ZonesService;
  let pricing: PricingService;
  let deliveries: DeliveriesService;
  let deliveryRepo: Repository<Delivery>;
  let adminRepo: Repository<AdminRoleAssignment>;

  beforeAll(async () => {
    database = await createPostgisDatabase(entities, migrations);
    const source = database.dataSource;
    const repos = {
      user: source.getRepository(User),
      driver: source.getRepository(DriverProfile),
      admin: source.getRepository(AdminRoleAssignment),
      business: source.getRepository(Business),
      member: source.getRepository(BusinessMember),
      zone: source.getRepository(DeliveryZone),
      pricing: source.getRepository(PricingRule),
      delivery: source.getRepository(Delivery),
      recipient: source.getRepository(Recipient),
      address: source.getRepository(DeliveryAddress),
      history: source.getRepository(DeliveryStatusHistory),
    };
    const idempotencyStub = {
      checkAndReplay: async () => null,
      record: async () => ({}),
    };
    module = await Test.createTestingModule({
      providers: [
        { provide: DataSource, useValue: source },
        { provide: getRepositoryToken(User), useValue: repos.user },
        {
          provide: getRepositoryToken(DriverProfile),
          useValue: repos.driver,
        },
        {
          provide: getRepositoryToken(AdminRoleAssignment),
          useValue: repos.admin,
        },
        { provide: getRepositoryToken(Business), useValue: repos.business },
        {
          provide: getRepositoryToken(BusinessMember),
          useValue: repos.member,
        },
        {
          provide: getRepositoryToken(DeliveryZone),
          useValue: repos.zone,
        },
        {
          provide: getRepositoryToken(PricingRule),
          useValue: repos.pricing,
        },
        { provide: getRepositoryToken(Delivery), useValue: repos.delivery },
        {
          provide: getRepositoryToken(Recipient),
          useValue: repos.recipient,
        },
        {
          provide: getRepositoryToken(DeliveryAddress),
          useValue: repos.address,
        },
        {
          provide: getRepositoryToken(DeliveryStatusHistory),
          useValue: repos.history,
        },
        {
          provide: BusinessesService,
          inject: [
            DataSource,
            getRepositoryToken(Business),
            getRepositoryToken(BusinessMember),
          ],
          useFactory: (
            ds: DataSource,
            b: Repository<Business>,
            m: Repository<BusinessMember>,
          ) => new BusinessesService(ds, b, m),
        },
        {
          provide: ZonesService,
          inject: [
            getRepositoryToken(DeliveryZone),
            getRepositoryToken(BusinessMember),
            getRepositoryToken(Business),
            getRepositoryToken(AdminRoleAssignment),
          ],
          useFactory: (
            z: Repository<DeliveryZone>,
            m: Repository<BusinessMember>,
            b: Repository<Business>,
            a: Repository<AdminRoleAssignment>,
          ) => new ZonesService(z, m, b, a),
        },
        {
          provide: PricingService,
          inject: [
            getRepositoryToken(PricingRule),
            getRepositoryToken(DeliveryZone),
            getRepositoryToken(BusinessMember),
            getRepositoryToken(Business),
            getRepositoryToken(AdminRoleAssignment),
          ],
          useFactory: (
            r: Repository<PricingRule>,
            z: Repository<DeliveryZone>,
            m: Repository<BusinessMember>,
            b: Repository<Business>,
            a: Repository<AdminRoleAssignment>,
          ) => new PricingService(r, z, m, b, a),
        },
        {
          provide: DeliveriesService,
          inject: [
            DataSource,
            PricingService,
            ZonesService,
            getRepositoryToken(Delivery),
            getRepositoryToken(Recipient),
            getRepositoryToken(DeliveryAddress),
            getRepositoryToken(DeliveryStatusHistory),
            getRepositoryToken(BusinessMember),
            getRepositoryToken(Business),
            getRepositoryToken(DriverProfile),
            getRepositoryToken(AdminRoleAssignment),
          ],
          useFactory: (
            ds: DataSource,
            p: PricingService,
            z: ZonesService,
            d: Repository<Delivery>,
            r: Repository<Recipient>,
            a: Repository<DeliveryAddress>,
            h: Repository<DeliveryStatusHistory>,
            m: Repository<BusinessMember>,
            b: Repository<Business>,
            dp: Repository<DriverProfile>,
            ar: Repository<AdminRoleAssignment>,
          ) =>
            new DeliveriesService(
              ds,
              p,
              z,
              idempotencyStub as never,
              d,
              r,
              a,
              h,
              m,
              b,
              dp,
              ar,
            ),
        },
      ],
    }).compile();
    businesses = module.get(BusinessesService);
    zones = module.get(ZonesService);
    pricing = module.get(PricingService);
    deliveries = module.get(DeliveriesService);
    deliveryRepo = repos.delivery;
    adminRepo = repos.admin;
  });

  afterAll(async () => {
    try {
      if (module) await module.close();
    } finally {
      if (database) await database.close();
    }
  });

  async function seedOwnerBusiness(suffix: string) {
    const phone = uniquePhone();
    const owner = await database.dataSource
      .getRepository(User)
      .save({ phone, displayName: `C01 owner ${suffix}` });
    const business = await businesses.create(owner.id, {
      name: `C01 business ${suffix}`,
      slug: `c01-${suffix}`,
      contactPhone: phone,
    });
    // Platform rules/zones in later tests need a platform admin actor.
    await adminRepo.save({
      userId: owner.id,
      grantedById: owner.id,
      role: AdminRole.ADMIN,
    });
    return { owner, business };
  }

  function deliveryDto(businessId: string | undefined, overrides = {}) {
    return {
      businessId,
      codAmount: '1',
      recipient: {
        name: 'C01 recipient',
        phone: uniquePhone(),
        city: 'Beirut',
        ...INSIDE,
      },
      pickupAddress: { city: 'Beirut', ...PICKUP },
      ...overrides,
    } as never;
  }

  it('persists trusted distance and quote provenance without caller distance', async () => {
    const { owner, business } = await seedOwnerBusiness(randomUUID());
    const rule = await pricing.create(owner.id, {
      businessId: business.id,
      zoneId: undefined,
      baseFee: '500',
      perKm: '200',
      codFeePercent: 50,
    } as never);
    const delivery = await deliveries.create(
      deliveryDto(business.id),
      owner.id,
    );

    const distance = haversineKm(PICKUP, INSIDE);
    expect(distance).toBeGreaterThan(1);
    const expectedPerKm = multiplyAndRoundHalfUp(
      200n,
      decimalToScaled(distance, 6, 'distanceKm'),
      1_000_000n,
    );
    // codFeePercent 50 on a 1-minor-unit COD: round-half-up of 0.5 → 1.
    const expectedTotal = 500n + expectedPerKm + 1n;

    expect(delivery.deliveryFee).toBe(expectedTotal.toString());
    expect(delivery.pricingRuleId).toBe(rule.id);
    expect(Number(delivery.quotedDistanceKm)).toBe(distance);
    expect(delivery.feeBreakdown).toMatchObject({
      pricingRuleId: rule.id,
      pricingRuleEffectiveFrom: rule.effectiveFrom.toISOString(),
      distanceKm: distance,
      baseFee: '500',
      zoneSurcharge: '0',
      perKmFee: expectedPerKm.toString(),
      codFee: '1',
      totalFee: expectedTotal.toString(),
      currency: 'USD',
    });
    // Integer-minor-unit reconciliation of the persisted snapshot.
    const snap = delivery.feeBreakdown!;
    expect(
      BigInt(snap.baseFee) +
        BigInt(snap.zoneSurcharge) +
        BigInt(snap.perKmFee) +
        BigInt(snap.codFee),
    ).toBe(BigInt(snap.totalFee));

    // The API serializer exposes provenance with a numeric distance.
    const response = toDeliveryResponse(
      await deliveryRepo.findOneByOrFail({ id: delivery.id }),
    );
    expect(response.pricingRuleId).toBe(rule.id);
    expect(response.quotedDistanceKm).toBe(distance);
    expect(typeof response.quotedDistanceKm).toBe('number');
  });

  it('rejects a caller distance below the straight-line floor', async () => {
    const { owner, business } = await seedOwnerBusiness(randomUUID());
    await expect(
      deliveries.create(
        deliveryDto(business.id, { distanceKm: 0.001 }),
        owner.id,
      ),
    ).rejects.toThrow(/straight-line minimum/);
  });

  it('honors a caller distance above the floor', async () => {
    const { owner, business } = await seedOwnerBusiness(randomUUID());
    await pricing.create(owner.id, {
      businessId: business.id,
      baseFee: '500',
      perKm: '200',
    } as never);
    const floor = haversineKm(PICKUP, INSIDE);
    const delivery = await deliveries.create(
      deliveryDto(business.id, { distanceKm: floor + 5 }),
      owner.id,
    );
    expect(Number(delivery.quotedDistanceKm)).toBe(roundDistanceKm(floor + 5));
  });

  it('keeps the historical quote reproducible after the rule changes', async () => {
    const { owner, business } = await seedOwnerBusiness(randomUUID());
    const rule = await pricing.create(owner.id, {
      businessId: business.id,
      baseFee: '300',
      perKm: '100',
    } as never);
    const delivery = await deliveries.create(
      deliveryDto(business.id),
      owner.id,
    );
    const quotedFee = delivery.deliveryFee;

    await pricing.update(rule.id, owner.id, { baseFee: '9999' });
    const updated = await database.dataSource
      .getRepository(PricingRule)
      .findOneByOrFail({ id: rule.id });
    expect(updated.baseFee).toBe('9999');

    const reloaded = await deliveryRepo.findOneByOrFail({
      id: delivery.id,
    });
    expect(reloaded.deliveryFee).toBe(quotedFee);
    expect(reloaded.feeBreakdown).toMatchObject({
      pricingRuleId: rule.id,
      baseFee: '300',
    });
    const snap = reloaded.feeBreakdown!;
    expect(
      BigInt(snap.baseFee) +
        BigInt(snap.zoneSurcharge) +
        BigInt(snap.perKmFee) +
        BigInt(snap.codFee),
    ).toBe(BigInt(snap.totalFee));
  });

  it('covers boundary points and prefers the business zone on ties', async () => {
    const { owner, business } = await seedOwnerBusiness(randomUUID());
    const platform = await zones.create(owner.id, {
      name: 'C01 platform square',
      businessId: null,
      boundary: SQUARE,
    });
    const scoped = await zones.create(owner.id, {
      name: 'C01 business square',
      businessId: business.id,
      boundary: SQUARE,
    });

    // Point exactly on the polygon edge is covered (ST_Covers semantics).
    const scopedHit = await zones.findZoneForPoint(
      ON_EDGE.longitude,
      ON_EDGE.latitude,
      business.id,
    );
    expect(scopedHit?.id).toBe(scoped.id);
    // Without a business scope only the platform zone matches.
    const platformHit = await zones.findZoneForPoint(
      ON_EDGE.longitude,
      ON_EDGE.latitude,
      null,
    );
    expect(platformHit?.id).toBe(platform.id);
  });

  it('selects rules by tenant, currency, and effective dates', async () => {
    const { owner, business } = await seedOwnerBusiness(randomUUID());
    const platformRule = await pricing.create(owner.id, {
      baseFee: '300',
    } as never);
    const businessRule = await pricing.create(owner.id, {
      businessId: business.id,
      baseFee: '700',
    } as never);

    // Tenant scope: the business rule wins for business quotes.
    const scoped = await pricing.computeFee(owner.id, {
      businessId: business.id,
      codAmount: '0',
      currency: 'USD',
    });
    expect(scoped.pricingRuleId).toBe(businessRule.id);

    // Personal quotes fall back to the platform rule.
    const personal = await pricing.computeFee(owner.id, {
      businessId: null,
      codAmount: '0',
      currency: 'USD',
    });
    expect(personal.pricingRuleId).toBe(platformRule.id);

    // Currency mismatch: no LBP rule exists.
    await expect(
      pricing.computeFee(owner.id, {
        businessId: null,
        codAmount: '0',
        currency: 'LBP',
      }),
    ).rejects.toThrow(/No pricing rule found/);

    // Effective dates: future rules are invisible, expired rules are skipped.
    const current = await pricing.create(owner.id, {
      baseFee: '111',
    } as never);
    await pricing.create(owner.id, {
      baseFee: '222',
      effectiveFrom: new Date(Date.now() + 86_400_000).toISOString(),
    } as never);
    const expired = await pricing.create(owner.id, {
      baseFee: '333',
      effectiveFrom: '2020-01-01T00:00:00.000Z',
      effectiveTo: '2021-01-01T00:00:00.000Z',
    } as never);
    const selected = await pricing.computeFee(owner.id, {
      businessId: null,
      codAmount: '0',
      currency: 'USD',
    });
    expect(selected.pricingRuleId).toBe(current.id);
    expect(selected.pricingRuleId).not.toBe(expired.id);
  });
});
