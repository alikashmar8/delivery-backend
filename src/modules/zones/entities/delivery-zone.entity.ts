import type { Relation } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Business } from '../../businesses/entities/business.entity';
import type { Delivery } from '../../deliveries/entities/delivery.entity';
import type { PricingRule } from '../../pricing/entities/pricing-rule.entity';

@Entity('delivery_zones')
export class DeliveryZone {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', nullable: true, name: 'businessId' })
  businessId!: string | null;

  @ManyToOne('Business', (entity: Business) => entity.deliveryZones, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'businessId' })
  business?: Relation<Business | null>;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'geometry', spatialFeatureType: 'Polygon', srid: 4326 })
  boundary!: unknown;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updatedAt' })
  updatedAt!: Date;

  @OneToMany('PricingRule', (entity: PricingRule) => entity.zone, {
    persistence: false,
  })
  pricingRules?: Relation<PricingRule[]>;

  @OneToMany('Delivery', (entity: Delivery) => entity.zone, {
    persistence: false,
  })
  deliveries?: Relation<Delivery[]>;
}
