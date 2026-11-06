import type { Relation } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Region } from '../../regions/entities/region.entity';
import type { User } from '../../users/entities/user.entity';
import type { Delivery } from './delivery.entity';

@Entity('recipients')
export class Recipient {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', unique: true, name: 'deliveryId' })
  deliveryId!: string;

  @OneToOne('Delivery', (entity: Delivery) => entity.recipient, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'deliveryId' })
  delivery?: Relation<Delivery>;

  @Column({ type: 'uuid', nullable: true, name: 'userId' })
  userId!: string | null;

  @ManyToOne('User', (entity: User) => entity.recipientSnapshots, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'userId' })
  user?: Relation<User | null>;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ type: 'varchar', length: 2, default: 'LB', name: 'countryCode' })
  countryCode!: string;

  @Column({ type: 'uuid', nullable: true, name: 'regionId' })
  regionId!: string | null;

  @ManyToOne('Region', (entity: Region) => entity.recipientSnapshots, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'regionId' })
  region?: Relation<Region | null>;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  street!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  building!: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  floor!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  apartment!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  landmark!: string | null;

  @Column({ type: 'text', nullable: true })
  instructions!: string | null;

  @Column({ type: 'numeric', precision: 10, scale: 7 })
  latitude!: number;

  @Column({ type: 'numeric', precision: 10, scale: 7 })
  longitude!: number;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt!: Date;
}
