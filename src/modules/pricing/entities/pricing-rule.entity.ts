import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { Business } from '../../businesses/entities/business.entity';
import type { DeliveryZone } from '../../zones/entities/delivery-zone.entity';

@Entity('pricing_rules')
export class PricingRule {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true, name: 'businessId' })
  businessId!: string | null;

  @ManyToOne('Business', (entity: Business) => entity.pricingRules, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'businessId' })
  business?: Relation<Business | null>;

  @Column({ type: 'uuid', nullable: true, name: 'zoneId' })
  zoneId!: string | null;

  @ManyToOne('DeliveryZone', (entity: DeliveryZone) => entity.pricingRules, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'zoneId' })
  zone?: Relation<DeliveryZone | null>;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({ type: 'bigint', name: 'baseFee' })
  baseFee!: string; // bigint mapped as string by pg driver

  @Column({ type: 'bigint', nullable: true, name: 'perKm' })
  perKm!: string | null;

  @Column({ type: 'bigint', default: 0, name: 'zoneSurcharge' })
  zoneSurcharge!: string;

  @Column({
    type: 'numeric',
    precision: 5,
    scale: 2,
    nullable: true,
    name: 'codFeePercent',
  })
  codFeePercent!: string | null;

  @Column({ type: 'int', default: 0 })
  priority!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({
    type: 'timestamptz',
    name: 'effectiveFrom',
    default: () => 'now()',
  })
  effectiveFrom!: Date;

  @Column({ type: 'timestamptz', nullable: true, name: 'effectiveTo' })
  effectiveTo!: Date | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updatedAt' })
  updatedAt!: Date;
}
