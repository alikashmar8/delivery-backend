import { describe, expect, it, vi } from 'vitest';
import { BusinessesService } from './businesses.service';
import { BusinessMemberRole } from './entities/business-member.entity';
import { DeliveriesService } from '../deliveries/deliveries.service';
import { PricingService } from '../pricing/pricing.service';
import { ZonesService } from '../zones/zones.service';

function suspendedBusinessRepo() {
  return {
    findOne: vi
      .fn()
      .mockResolvedValue({ id: 'business-id', status: 'suspended' }),
  } as never;
}

function activeMemberRepo(role: BusinessMemberRole = BusinessMemberRole.OWNER) {
  return {
    findOne: vi.fn().mockResolvedValue({ role, status: 'active' }),
  } as never;
}

describe('S02 suspended-business eligibility (unit)', () => {
  it('denies adding a member to a suspended business', async () => {
    const service = new BusinessesService(
      {} as never,
      suspendedBusinessRepo(),
      activeMemberRepo(),
    );
    await expect(
      service.addMember(
        'business-id',
        'user-id',
        BusinessMemberRole.OPERATOR,
        'owner-id',
      ),
    ).rejects.toThrow('Business is suspended');
  });

  it('denies creating a business delivery when suspended', async () => {
    const service = new DeliveriesService(
      {} as never,
      {} as never,
      { findZoneForPoint: vi.fn() } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      activeMemberRepo() as never,
      suspendedBusinessRepo() as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    await expect(
      service.create(
        {
          businessId: 'business-id',
          codAmount: '0',
          recipient: {
            name: 'R',
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
        } as never,
        'owner-id',
      ),
    ).rejects.toThrow('Business is suspended');
  });

  it('denies creating a pricing rule when suspended', async () => {
    const pricing = new PricingService(
      {} as never,
      { findOne: vi.fn().mockResolvedValue(null) } as never,
      activeMemberRepo() as never,
      suspendedBusinessRepo() as never,
      {} as never,
    );
    await expect(
      pricing.create('owner-id', {
        businessId: 'business-id',
        baseFee: '500',
      } as never),
    ).rejects.toThrow('Business is suspended');
  });

  it('denies creating a zone when suspended', async () => {
    const zones = new ZonesService(
      {} as never,
      activeMemberRepo() as never,
      suspendedBusinessRepo() as never,
      {} as never,
    );
    await expect(
      zones.create('owner-id', {
        name: 'Z',
        businessId: 'business-id',
        boundary: { type: 'Polygon', coordinates: [] },
      }),
    ).rejects.toThrow('Business is suspended');
  });
});
