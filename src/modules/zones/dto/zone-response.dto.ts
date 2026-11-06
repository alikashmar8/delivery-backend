import { ApiProperty } from '@nestjs/swagger';
import { DeliveryZone } from '../entities/delivery-zone.entity';

export class DeliveryZoneResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid', nullable: true })
  businessId!: string | null;
  @ApiProperty()
  name!: string;
  @ApiProperty({ type: 'object', additionalProperties: true })
  boundary!: unknown;
  @ApiProperty()
  active!: boolean;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class PaginatedDeliveryZoneResponseDto {
  @ApiProperty({ type: () => [DeliveryZoneResponseDto] })
  items!: DeliveryZoneResponseDto[];
  @ApiProperty({ example: 20 })
  take!: number;
  @ApiProperty({ example: 0 })
  skip!: number;
}

export function toDeliveryZoneResponse(
  zone: DeliveryZone,
): DeliveryZoneResponseDto {
  return {
    id: zone.id,
    businessId: zone.businessId,
    name: zone.name,
    boundary: zone.boundary,
    active: zone.active,
    createdAt: zone.createdAt,
    updatedAt: zone.updatedAt,
  };
}
