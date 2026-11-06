import { describe, expect, it, vi } from 'vitest';
import { DeliveriesService } from '../modules/deliveries/deliveries.service';
import { PricingService } from '../modules/pricing/pricing.service';
import { ZonesService } from '../modules/zones/zones.service';

describe('cross-business isolation', () => {
  it('does not expose another business zone', async () => {
    const zones = new ZonesService(
      {
        findOne: vi.fn().mockResolvedValue({
          id: 'zone-id',
          businessId: 'business-b',
        }),
      } as never,
      { findOne: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
      { findOne: vi.fn().mockResolvedValue(null) } as never,
    );
    await expect(
      zones.findAuthorizedById('zone-id', 'business-a-user'),
    ).rejects.toThrow('Zone not found or access denied');
  });

  it('does not allow a business pricing rule to reference another tenant zone', async () => {
    const save = vi.fn();
    const pricing = new PricingService(
      { save } as never,
      {
        findOne: vi.fn().mockResolvedValue({
          id: 'zone-b',
          businessId: 'business-b',
          active: true,
        }),
      } as never,
      {
        findOne: vi.fn().mockResolvedValue({ role: 'owner' }),
      } as never,
      {
        findOne: vi
          .fn()
          .mockResolvedValue({ id: 'business-a', status: 'active' }),
      } as never,
      {} as never,
    );
    await expect(
      pricing.create('business-a-user', {
        businessId: 'business-a',
        zoneId: 'zone-b',
        baseFee: '500',
      }),
    ).rejects.toThrow('another business zone');
    expect(save).not.toHaveBeenCalled();
  });

  it('does not expose another business delivery or its details', async () => {
    const deliveries = new DeliveriesService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {
        findOne: vi.fn().mockResolvedValue({
          id: 'delivery-id',
          businessId: 'business-b',
          createdByUserId: 'business-b-user',
          driverId: null,
        }),
      } as never,
      { findOne: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      { findOne: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
      { findOne: vi.fn().mockResolvedValue(null) } as never,
      { findOne: vi.fn().mockResolvedValue(null) } as never,
    );
    await expect(
      deliveries.findAuthorizedById('delivery-id', 'business-a-user'),
    ).rejects.toThrow('Delivery not found or access denied');
  });
});
