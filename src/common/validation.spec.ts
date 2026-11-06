import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { PaginationQueryDto } from './dto/pagination.dto';
import { CreateDeliveryDto } from '../modules/deliveries/dto/delivery.dto';
import { UpdateAddressDto } from '../modules/addresses/dto/address.dto';
import { UpdatePricingRuleDto } from '../modules/pricing/dto/pricing-rule.dto';
import { CreateZoneDto } from '../modules/zones/dto/zone.dto';

async function errorsFor<T extends object>(type: new () => T, value: object) {
  return await validate(plainToInstance(type, value), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
}

describe('stabilized DTO validation', () => {
  it('accepts a truly partial address update', async () => {
    expect(await errorsFor(UpdateAddressDto, { label: 'Home' })).toHaveLength(
      0,
    );
  });

  it('rejects pricing PATCH mass-assignment fields', async () => {
    const errors = await errorsFor(UpdatePricingRuleDto, {
      baseFee: '500',
      businessId: '00000000-0000-4000-8000-000000000001',
    });
    expect(errors.some((error) => error.property === 'businessId')).toBe(true);
  });

  it('validates nested delivery snapshots and required coordinates', async () => {
    const valid = {
      codAmount: '1000',
      recipient: {
        name: 'Recipient',
        phone: '+96171111111',
        city: 'Beirut',
        latitude: 33.8938,
        longitude: 35.5018,
      },
      pickupAddress: {
        city: 'Beirut',
        latitude: 33.9,
        longitude: 35.5,
      },
    };
    expect(await errorsFor(CreateDeliveryDto, valid)).toHaveLength(0);

    const invalid = structuredClone(valid);
    delete (invalid.recipient as Partial<typeof invalid.recipient>).latitude;
    const errors = await errorsFor(CreateDeliveryDto, invalid);
    expect(errors.some((error) => error.property === 'recipient')).toBe(true);
  });

  it('accepts a closed valid Polygon and rejects malformed GeoJSON', async () => {
    const boundary = {
      type: 'Polygon',
      coordinates: [
        [
          [35.49, 33.88],
          [35.52, 33.88],
          [35.52, 33.91],
          [35.49, 33.88],
        ],
      ],
    };
    expect(
      await errorsFor(CreateZoneDto, { name: 'Beirut', boundary }),
    ).toHaveLength(0);
    expect(
      await errorsFor(CreateZoneDto, {
        name: 'Bad',
        boundary: {
          type: 'Polygon',
          coordinates: [
            [
              [0, 0],
              [1, 1],
            ],
          ],
        },
      }),
    ).not.toHaveLength(0);
  });

  it('bounds pagination and transforms query strings', async () => {
    const valid = plainToInstance(PaginationQueryDto, {
      take: '100',
      skip: '5',
    });
    expect(await validate(valid)).toHaveLength(0);
    expect(valid).toMatchObject({ take: 100, skip: 5 });
    expect(
      await errorsFor(PaginationQueryDto, { take: 101, skip: 0 }),
    ).not.toHaveLength(0);
  });
});
