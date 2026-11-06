import { ApiProperty } from '@nestjs/swagger';
import { Address } from '../entities/address.entity';

export class AddressResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ minLength: 2, maxLength: 2, example: 'LB' })
  countryCode!: string;
  @ApiProperty({ format: 'uuid', nullable: true })
  regionId!: string | null;
  @ApiProperty()
  city!: string;
  @ApiProperty({ type: String, nullable: true })
  street!: string | null;
  @ApiProperty({ type: String, nullable: true })
  building!: string | null;
  @ApiProperty({ type: String, nullable: true })
  floor!: string | null;
  @ApiProperty({ type: String, nullable: true })
  apartment!: string | null;
  @ApiProperty({ type: String, nullable: true })
  landmark!: string | null;
  @ApiProperty({ type: String, nullable: true })
  instructions!: string | null;
  @ApiProperty({ type: Number, nullable: true, minimum: -90, maximum: 90 })
  latitude!: number | null;
  @ApiProperty({ type: Number, nullable: true, minimum: -180, maximum: 180 })
  longitude!: number | null;
  @ApiProperty({ type: String, nullable: true })
  label!: string | null;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class PaginatedAddressResponseDto {
  @ApiProperty({ type: () => [AddressResponseDto] })
  items!: AddressResponseDto[];
  @ApiProperty({ example: 20 })
  take!: number;
  @ApiProperty({ example: 0 })
  skip!: number;
}

export function toAddressResponse(address: Address): AddressResponseDto {
  return {
    id: address.id,
    countryCode: address.countryCode,
    regionId: address.regionId,
    city: address.city,
    street: address.street,
    building: address.building,
    floor: address.floor,
    apartment: address.apartment,
    landmark: address.landmark,
    instructions: address.instructions,
    latitude: address.latitude,
    longitude: address.longitude,
    label: address.label,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
}
