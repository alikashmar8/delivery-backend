import { ApiProperty } from '@nestjs/swagger';
import { DeliveryAddress } from '../entities/delivery-address.entity';
import { DeliveryStatusHistory } from '../entities/delivery-status-history.entity';
import {
  Delivery,
  DeliveryFeeBreakdown,
  DeliveryStatus,
  PaymentMethod,
} from '../entities/delivery.entity';
import { Recipient } from '../entities/recipient.entity';

export class DeliverySummaryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  trackingCode!: string;
  @ApiProperty({ format: 'uuid', nullable: true })
  businessId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true })
  driverId!: string | null;
  @ApiProperty({ format: 'uuid', nullable: true })
  zoneId!: string | null;
  @ApiProperty({ enum: DeliveryStatus })
  status!: DeliveryStatus;
  @ApiProperty({ minimum: 1 })
  version!: number;
  @ApiProperty({ minLength: 3, maxLength: 3, example: 'USD' })
  currency!: string;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  deliveryFee!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  scheduledAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
  @ApiProperty({ type: String, format: 'date-time' })
  updatedAt!: Date;
}

export class DeliveryFeeBreakdownResponseDto {
  @ApiProperty({ format: 'uuid' })
  pricingRuleId!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  pricingRuleEffectiveFrom!: string;
  @ApiProperty({ minimum: 0, multipleOf: 0.000001 })
  distanceKm!: number;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  baseFee!: string;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  zoneSurcharge!: string;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  perKmFee!: string;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  codFee!: string;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  totalFee!: string;
  @ApiProperty({ minLength: 3, maxLength: 3, example: 'USD' })
  currency!: string;
}

export class DeliveryResponseDto extends DeliverySummaryResponseDto {
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  codAmount!: string;
  @ApiProperty({ pattern: '^(0|[1-9]\\d*)$' })
  collectableAmount!: string;
  @ApiProperty({ enum: PaymentMethod })
  paymentMethod!: PaymentMethod;
  @ApiProperty({ type: String, nullable: true })
  notes!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  pickedUpAt!: Date | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  deliveredAt!: Date | null;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  pricingRuleId!: string | null;
  @ApiProperty({
    type: Number,
    nullable: true,
    minimum: 0,
    multipleOf: 0.000001,
  })
  quotedDistanceKm!: number | null;
  @ApiProperty({ type: () => DeliveryFeeBreakdownResponseDto, nullable: true })
  feeBreakdown!: DeliveryFeeBreakdown | null;
}

export class DeliveryHistoryResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ type: String, nullable: true })
  fromStatus!: string | null;
  @ApiProperty({ type: String })
  toStatus!: string;
  @ApiProperty({ type: String })
  actorType!: string;
  @ApiProperty({ type: String, nullable: true })
  reason!: string | null;
  @ApiProperty({ type: String, nullable: true })
  note!: string | null;
  @ApiProperty({ type: String, format: 'date-time' })
  occurredAt!: Date;
}

export class RecipientResponseDto {
  @ApiProperty()
  name!: string;
  @ApiProperty()
  phone!: string;
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
  @ApiProperty({ type: Number, minimum: -90, maximum: 90 })
  latitude!: number;
  @ApiProperty({ type: Number, minimum: -180, maximum: 180 })
  longitude!: number;
}

export class PickupAddressResponseDto {
  @ApiProperty({ minLength: 2, maxLength: 2, example: 'LB' })
  countryCode!: string;
  @ApiProperty({ format: 'uuid', nullable: true })
  regionId!: string | null;
  @ApiProperty()
  city!: string;
  @ApiProperty({ nullable: true })
  street!: string | null;
  @ApiProperty({ nullable: true })
  building!: string | null;
  @ApiProperty({ nullable: true })
  floor!: string | null;
  @ApiProperty({ nullable: true })
  apartment!: string | null;
  @ApiProperty({ nullable: true })
  landmark!: string | null;
  @ApiProperty({ nullable: true })
  instructions!: string | null;
  @ApiProperty({ type: Number, minimum: -90, maximum: 90 })
  latitude!: number;
  @ApiProperty({ type: Number, minimum: -180, maximum: 180 })
  longitude!: number;
  @ApiProperty({ type: String, nullable: true })
  contactName!: string | null;
  @ApiProperty({ type: String, nullable: true })
  contactPhone!: string | null;
}

export class DeliveryDetailResponseDto {
  @ApiProperty({ type: () => DeliveryResponseDto })
  delivery: DeliveryResponseDto;
  @ApiProperty({ type: () => RecipientResponseDto })
  recipient: RecipientResponseDto;
  @ApiProperty({ type: () => PickupAddressResponseDto })
  pickup: PickupAddressResponseDto;
}

export class PaginatedDeliverySummaryResponseDto {
  @ApiProperty({ type: () => [DeliverySummaryResponseDto] })
  items!: DeliverySummaryResponseDto[];
  @ApiProperty({ example: 20 })
  take!: number;
  @ApiProperty({ example: 0 })
  skip!: number;
}

export class PaginatedDeliveryHistoryResponseDto {
  @ApiProperty({ type: () => [DeliveryHistoryResponseDto] })
  items!: DeliveryHistoryResponseDto[];
  @ApiProperty({ example: 20 })
  take!: number;
  @ApiProperty({ example: 0 })
  skip!: number;
}

export function toDeliveryResponse(delivery: Delivery): DeliveryResponseDto {
  return {
    ...toDeliverySummaryResponse(delivery),
    codAmount: delivery.codAmount,
    collectableAmount: delivery.collectableAmount,
    paymentMethod: delivery.paymentMethod,
    notes: delivery.notes,
    pickedUpAt: delivery.pickedUpAt,
    deliveredAt: delivery.deliveredAt,
    pricingRuleId: delivery.pricingRuleId ?? null,
    // NUMERIC columns hydrate as strings via pg; serialize deliberately.
    quotedDistanceKm:
      delivery.quotedDistanceKm === null ||
      delivery.quotedDistanceKm === undefined
        ? null
        : Number(delivery.quotedDistanceKm),
    feeBreakdown: delivery.feeBreakdown ?? null,
  };
}

export function toDeliverySummaryResponse(
  delivery: Delivery,
): DeliverySummaryResponseDto {
  return {
    id: delivery.id,
    trackingCode: delivery.trackingCode,
    businessId: delivery.businessId,
    driverId: delivery.driverId,
    zoneId: delivery.zoneId,
    status: delivery.status,
    version: delivery.version,
    currency: delivery.currency,
    deliveryFee: delivery.deliveryFee,
    scheduledAt: delivery.scheduledAt,
    createdAt: delivery.createdAt,
    updatedAt: delivery.updatedAt,
  };
}

export function toDeliveryHistoryResponse(
  history: DeliveryStatusHistory,
): DeliveryHistoryResponseDto {
  return {
    id: history.id,
    fromStatus: history.fromStatus,
    toStatus: history.toStatus,
    actorType: history.actorType,
    reason: history.reason,
    note: history.note,
    occurredAt: history.occurredAt,
  };
}

export function toRecipientResponse(
  recipient: Recipient,
): RecipientResponseDto {
  return {
    name: recipient.name,
    phone: recipient.phone,
    countryCode: recipient.countryCode,
    regionId: recipient.regionId,
    city: recipient.city,
    street: recipient.street,
    building: recipient.building,
    floor: recipient.floor,
    apartment: recipient.apartment,
    landmark: recipient.landmark,
    instructions: recipient.instructions,
    // Cast through unknown to handle potential string values from PostgreSQL
    latitude: recipient.latitude as unknown as number,
    longitude: recipient.longitude as unknown as number,
  };
}

export function toPickupAddressResponse(
  pickup: DeliveryAddress,
): PickupAddressResponseDto {
  return {
    countryCode: pickup.countryCode,
    regionId: pickup.regionId,
    city: pickup.city,
    street: pickup.street,
    building: pickup.building,
    floor: pickup.floor,
    apartment: pickup.apartment,
    landmark: pickup.landmark,
    instructions: pickup.instructions,
    // Cast through unknown to handle potential string values from PostgreSQL
    latitude: pickup.latitude as unknown as number,
    longitude: pickup.longitude as unknown as number,
    contactName: pickup.contactName,
    contactPhone: pickup.contactPhone,
  };
}
