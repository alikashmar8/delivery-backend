import { describe, expect, it, vi } from 'vitest';
import { BusinessesService } from '../businesses/businesses.service';
import { Business } from '../businesses/entities/business.entity';
import { AdminRole } from '../users/entities/admin-role-assignment.entity';
import { DeliveriesService } from './deliveries.service';
import { DeliveryAddress } from './entities/delivery-address.entity';
import { Delivery, DeliveryStatus } from './entities/delivery.entity';
import { Recipient } from './entities/recipient.entity';
import { toDeliveryResponse } from './dto/delivery-response.dto';
import { canTransition } from './state-machine/delivery-state-machine';

describe('transactional stabilization', () => {
  it('runs business and owner creation inside one transaction', async () => {
    const businessRepo = {
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn((value) => value),
      save: vi.fn().mockResolvedValue({ id: 'business-id' }),
    };
    const memberRepo = {
      create: vi.fn((value) => value),
      save: vi.fn().mockRejectedValue(new Error('member insert failed')),
    };
    const manager = {
      getRepository: vi.fn((entity) =>
        entity === Business ? businessRepo : memberRepo,
      ),
    };
    const dataSource = {
      transaction: vi.fn(async (callback) => await callback(manager)),
    };
    const service = new BusinessesService(
      dataSource as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.create('owner-id', {
        name: 'Business',
        slug: 'business',
        contactPhone: '+96171111111',
      }),
    ).rejects.toThrow('member insert failed');
    expect(dataSource.transaction).toHaveBeenCalledOnce();
    expect(memberRepo.save).toHaveBeenCalledOnce();
  });

  it('keeps delivery aggregate creation inside one transaction', async () => {
    const deliveryRepo = {
      create: vi.fn((value) => value),
      save: vi.fn(async (value) => ({ ...value, id: 'delivery-id' })),
    };
    const recipientRepo = {
      create: vi.fn((value) => value),
      save: vi.fn().mockRejectedValue(new Error('recipient insert failed')),
    };
    const addressRepo = { create: vi.fn(), save: vi.fn() };
    const historyRepo = { create: vi.fn(), save: vi.fn() };
    const manager = {
      getRepository: vi.fn((entity) => {
        if (entity === Delivery) return deliveryRepo;
        if (entity === Recipient) return recipientRepo;
        if (entity === DeliveryAddress) return addressRepo;
        return historyRepo;
      }),
    };
    const dataSource = {
      transaction: vi.fn(async (callback) => await callback(manager)),
    };
    const pricing = {
      computeFee: vi.fn().mockResolvedValue({
        totalFee: '500',
        currency: 'USD',
      }),
    };
    const service = new DeliveriesService(
      dataSource as never,
      pricing as never,
      { findZoneForPoint: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.create(
        {
          codAmount: '1000',
          recipient: {
            name: 'Recipient',
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
        },
        'user-id',
      ),
    ).rejects.toThrow('recipient insert failed');
    expect(dataSource.transaction).toHaveBeenCalledOnce();
    expect(addressRepo.save).not.toHaveBeenCalled();
  });

  it('keeps delivery update and history append in one transaction', async () => {
    const delivery = {
      id: 'delivery-id',
      status: DeliveryStatus.IN_TRANSIT,
      version: 3,
    };
    const deliveryRepo = {
      findOne: vi.fn().mockResolvedValue(delivery),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    const historyRepo = {
      create: vi.fn((value) => value),
      save: vi.fn().mockRejectedValue(new Error('history insert failed')),
    };
    const manager = {
      getRepository: vi.fn((entity) =>
        entity === Delivery ? deliveryRepo : historyRepo,
      ),
    };
    const dataSource = {
      transaction: vi.fn(async (callback) => await callback(manager)),
    };
    const adminRepo = {
      findOne: vi.fn().mockResolvedValue({ role: AdminRole.ADMIN }),
    };
    const service = new DeliveriesService(
      dataSource as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      adminRepo as never,
    );

    await expect(
      service.transitionAsAdmin(
        'delivery-id',
        {
          toStatus: DeliveryStatus.FAILED,
          expectedVersion: 3,
          reason: 'recipient_unavailable',
        },
        'admin-id',
      ),
    ).rejects.toThrow('history insert failed');
    expect(deliveryRepo.update).toHaveBeenCalledWith(
      { id: 'delivery-id', version: 3 },
      expect.objectContaining({ version: 4, status: DeliveryStatus.FAILED }),
    );
  });
});

describe('delivery lifecycle and serialization', () => {
  it('matches terminal and reschedule rules from the approved FSM', () => {
    expect(
      canTransition(
        DeliveryStatus.DELIVERED,
        DeliveryStatus.CANCELLED,
        'admin',
      ),
    ).toBe(false);
    expect(
      canTransition(
        DeliveryStatus.RESCHEDULED,
        DeliveryStatus.IN_TRANSIT,
        'admin',
      ),
    ).toBe(true);
    expect(
      canTransition(DeliveryStatus.ASSIGNED, DeliveryStatus.CREATED, 'admin'),
    ).toBe(true);
  });

  it('never serializes the secure tracking token', () => {
    const response = toDeliveryResponse({
      id: 'delivery-id',
      trackingCode: 'DLV-1',
      secureTrackingToken: 'must-not-leak',
      createdByUserId: 'creator-id',
      businessId: null,
      driverId: null,
      zoneId: null,
      status: DeliveryStatus.CREATED,
      version: 1,
      currency: 'USD',
      codAmount: '0',
      deliveryFee: '500',
      collectableAmount: '500',
      paymentMethod: 'cod',
      notes: null,
      scheduledAt: null,
      pickedUpAt: null,
      deliveredAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Delivery);
    expect(response).not.toHaveProperty('secureTrackingToken');
    expect(response).not.toHaveProperty('createdByUserId');
  });
});
