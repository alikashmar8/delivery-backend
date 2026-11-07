import type { DeliveryFinancialSnapshot } from '../../finance/entities/delivery-financial-snapshot.entity';
import type { LedgerEntry } from '../../finance/entities/ledger-entry.entity';
import type { Relation } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import type { Business } from '../../businesses/entities/business.entity';
import type { DriverProfile } from '../../users/entities/driver-profile.entity';
import type { User } from '../../users/entities/user.entity';
import type { DeliveryZone } from '../../zones/entities/delivery-zone.entity';
import type { DeliveryAddress } from './delivery-address.entity';
import type { DeliveryStatusHistory } from './delivery-status-history.entity';
import type { Recipient } from './recipient.entity';

export enum DeliveryStatus {
  CREATED = 'CREATED',
  ASSIGNED = 'ASSIGNED',
  ACCEPTED = 'ACCEPTED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  ARRIVED = 'ARRIVED',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
  RESCHEDULED = 'RESCHEDULED',
  RETURNED = 'RETURNED',
  CANCELLED = 'CANCELLED',
}

export const ACTIVE_DRIVER_DELIVERY_STATUSES = [
  DeliveryStatus.ASSIGNED,
  DeliveryStatus.ACCEPTED,
  DeliveryStatus.PICKED_UP,
  DeliveryStatus.IN_TRANSIT,
  DeliveryStatus.ARRIVED,
  DeliveryStatus.FAILED,
  DeliveryStatus.RESCHEDULED,
];

export enum PaymentMethod {
  COD = 'cod',
  PREPAID = 'prepaid',
  ACCOUNT = 'account',
}

/**
 * C01: immutable quote provenance persisted at creation. Captures the exact
 * inputs, rule version anchor, and fee breakdown so a historical quote stays
 * reproducible after pricing rules change. Money stays integer minor-unit
 * strings; distance is km rounded to 6 decimals.
 */
export interface DeliveryFeeBreakdown {
  pricingRuleId: string;
  pricingRuleEffectiveFrom: string;
  distanceKm: number;
  baseFee: string;
  zoneSurcharge: string;
  perKmFee: string;
  codFee: string;
  totalFee: string;
  currency: string;
}

@Entity('deliveries')
export class Delivery {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 50, unique: true, name: 'trackingCode' })
  trackingCode!: string;

  @Column({
    type: 'varchar',
    length: 64,
    unique: true,
    name: 'secureTrackingToken',
  })
  secureTrackingToken!: string;

  @Column({ type: 'uuid', name: 'createdByUserId' })
  createdByUserId!: string;

  @ManyToOne('User', (entity: User) => entity.createdDeliveries, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'createdByUserId' })
  createdByUser?: Relation<User | null>;

  @Column({ type: 'uuid', nullable: true, name: 'businessId' })
  businessId!: string | null;

  @ManyToOne('Business', (entity: Business) => entity.deliveries, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'businessId' })
  business?: Relation<Business | null>;

  @Column({ type: 'uuid', nullable: true, name: 'driverId' })
  driverId!: string | null;

  @ManyToOne('DriverProfile', (entity: DriverProfile) => entity.deliveries, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'driverId' })
  driver?: Relation<DriverProfile | null>;

  @Column({ type: 'uuid', nullable: true, name: 'zoneId' })
  zoneId!: string | null;

  @ManyToOne('DeliveryZone', (entity: DeliveryZone) => entity.deliveries, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'zoneId' })
  zone?: Relation<DeliveryZone | null>;

  @Column({ type: 'varchar', length: 20, default: DeliveryStatus.CREATED })
  status!: DeliveryStatus;

  @VersionColumn({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({ type: 'bigint', default: 0, name: 'codAmount' })
  codAmount!: string; // integer minor units

  @Column({ type: 'bigint', default: 0, name: 'deliveryFee' })
  deliveryFee!: string;

  @Column({ type: 'bigint', default: 0, name: 'collectableAmount' })
  collectableAmount!: string;

  /**
   * C01 provenance. Plain uuid column (no DB FK by design): the rule row is
   * never deleted (versioned via active flag), and a historical pointer must
   * survive rule deactivation — so no F06 relation pair is required.
   */
  @Column({ type: 'uuid', nullable: true, name: 'pricingRuleId' })
  pricingRuleId!: string | null;

  /** Authoritative billable distance in km (haversine floor enforced). */
  @Column({
    type: 'numeric',
    precision: 12,
    scale: 6,
    nullable: true,
    name: 'quotedDistanceKm',
  })
  quotedDistanceKm!: number | null;

  /** Full quote snapshot; null only for rows created before C01. */
  @Column({ type: 'jsonb', nullable: true, name: 'feeBreakdown' })
  feeBreakdown!: DeliveryFeeBreakdown | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: PaymentMethod.COD,
    name: 'paymentMethod',
  })
  paymentMethod!: PaymentMethod;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'scheduledAt' })
  scheduledAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'pickedUpAt' })
  pickedUpAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true, name: 'deliveredAt' })
  deliveredAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updatedAt' })
  updatedAt!: Date;

  @OneToOne('Recipient', (entity: Recipient) => entity.delivery, {
    persistence: false,
  })
  recipient?: Relation<Recipient | null>;

  @OneToOne('DeliveryAddress', (entity: DeliveryAddress) => entity.delivery, {
    persistence: false,
  })
  pickupAddress?: Relation<DeliveryAddress | null>;

  @OneToMany(
    'DeliveryStatusHistory',
    (entity: DeliveryStatusHistory) => entity.delivery,
    { persistence: false },
  )
  statusHistory?: Relation<DeliveryStatusHistory[]>;

  @OneToMany('LedgerEntry', (entry: LedgerEntry) => entry.delivery, {
    persistence: false,
  })
  ledgerEntries?: Relation<LedgerEntry[]>;

  @OneToOne(
    'DeliveryFinancialSnapshot',
    (snapshot: DeliveryFinancialSnapshot) => snapshot.delivery,
    { persistence: false },
  )
  financialSnapshot?: Relation<DeliveryFinancialSnapshot | null>;
}
