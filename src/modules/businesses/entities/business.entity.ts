import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { BusinessMember } from './business-member.entity';
import type { Delivery } from '../../deliveries/entities/delivery.entity';
import type { DeliveryZone } from '../../zones/entities/delivery-zone.entity';
import type { PricingRule } from '../../pricing/entities/pricing-rule.entity';

export enum BusinessStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

@Entity('businesses')
export class Business {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  slug!: string;

  @Column({ type: 'varchar', length: 20, default: BusinessStatus.ACTIVE })
  status!: BusinessStatus;

  @Column({ type: 'varchar', length: 2, default: 'LB' })
  country!: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({ type: 'jsonb', name: 'settlementConfig', default: () => "'{}'" })
  settlementConfig!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 20, name: 'contactPhone' })
  contactPhone!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'legalName' })
  legalName!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updatedAt' })
  updatedAt!: Date;

  @OneToMany('BusinessMember', (entity: BusinessMember) => entity.business, {
    persistence: false,
  })
  members?: Relation<BusinessMember[]>;

  @OneToMany('DeliveryZone', (entity: DeliveryZone) => entity.business, {
    persistence: false,
  })
  deliveryZones?: Relation<DeliveryZone[]>;

  @OneToMany('PricingRule', (entity: PricingRule) => entity.business, {
    persistence: false,
  })
  pricingRules?: Relation<PricingRule[]>;

  @OneToMany('Delivery', (entity: Delivery) => entity.business, {
    persistence: false,
  })
  deliveries?: Relation<Delivery[]>;
}
