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
import type { Address } from '../../addresses/entities/address.entity';
import type { DeliveryAddress } from '../../deliveries/entities/delivery-address.entity';
import type { Recipient } from '../../deliveries/entities/recipient.entity';

export enum RegionType {
  COUNTRY = 'country',
  GOVERNORATE = 'governorate',
  DISTRICT = 'district',
  AREA = 'area',
}

@Entity('regions')
export class Region {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  type!: RegionType;

  @Column({ type: 'varchar', length: 20 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'uuid', nullable: true, name: 'parentId' })
  parentId!: string | null;

  @ManyToOne('Region', (entity: Region) => entity.children, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'parentId' })
  parent?: Relation<Region | null>;

  @Column({ type: 'varchar', length: 2, default: 'LB', name: 'countryCode' })
  countryCode!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updatedAt' })
  updatedAt!: Date;

  @OneToMany('Address', (entity: Address) => entity.region, {
    persistence: false,
  })
  addresses?: Relation<Address[]>;

  @OneToMany('Region', (entity: Region) => entity.parent, {
    persistence: false,
  })
  children?: Relation<Region[]>;

  @OneToMany('Recipient', (entity: Recipient) => entity.region, {
    persistence: false,
  })
  recipientSnapshots?: Relation<Recipient[]>;

  @OneToMany('DeliveryAddress', (entity: DeliveryAddress) => entity.region, {
    persistence: false,
  })
  pickupAddressSnapshots?: Relation<DeliveryAddress[]>;
}
