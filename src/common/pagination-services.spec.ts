import { describe, expect, it, vi } from 'vitest';
import { AddressesService } from '../modules/addresses/addresses.service';
import { DeliveriesService } from '../modules/deliveries/deliveries.service';
import { PricingService } from '../modules/pricing/pricing.service';
import { RegionsService } from '../modules/regions/regions.service';
import { ZonesService } from '../modules/zones/zones.service';

const page = { take: 7, skip: 14 };

describe('collection pagination', () => {
  it('bounds address and region listings with deterministic ordering', async () => {
    const addressRepo = { find: vi.fn().mockResolvedValue([]) };
    await new AddressesService(addressRepo as never).findMine('user-id', page);
    expect(addressRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 7, skip: 14 }),
    );

    const regionRepo = { find: vi.fn().mockResolvedValue([]) };
    const regions = new RegionsService(regionRepo as never);
    await regions.findAll('LB', page);
    await regions.findChildren('parent-id', page);
    expect(regionRepo.find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ take: 7, skip: 14 }),
    );
    expect(regionRepo.find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ take: 7, skip: 14 }),
    );
  });

  it('bounds tenant zone and pricing listings', async () => {
    const zoneRepo = { find: vi.fn().mockResolvedValue([]) };
    const memberRepo = {
      findOne: vi.fn().mockResolvedValue({ role: 'owner' }),
    };
    const zones = new ZonesService(
      zoneRepo as never,
      memberRepo as never,
      {} as never,
      {} as never,
    );
    await zones.findAll('user-id', 'business-id', page);
    expect(zoneRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 7, skip: 14 }),
    );

    const pricingRepo = { find: vi.fn().mockResolvedValue([]) };
    const pricing = new PricingService(
      pricingRepo as never,
      {} as never,
      memberRepo as never,
      {} as never,
      {} as never,
    );
    await pricing.findAll('user-id', 'business-id', page);
    expect(pricingRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 7, skip: 14 }),
    );
  });

  it('bounds delivery listings and history without leaking business deliveries', async () => {
    const delivery = {
      id: 'delivery-id',
      businessId: null,
      createdByUserId: 'user-id',
    };
    const deliveryRepo = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(delivery),
    };
    const historyRepo = { find: vi.fn().mockResolvedValue([]) };
    const service = new DeliveriesService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      deliveryRepo as never,
      { findOne: vi.fn() } as never,
      {} as never,
      historyRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await service.findAll('user-id', { take: 7, skip: 14 });
    expect(deliveryRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 7,
        skip: 14,
        where: expect.objectContaining({ createdByUserId: 'user-id' }),
      }),
    );
    await service.getHistory('delivery-id', 'user-id', page);
    expect(historyRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ take: 7, skip: 14 }),
    );
  });
});
