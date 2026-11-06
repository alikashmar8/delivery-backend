import type { Relation } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Delivery } from '../../deliveries/entities/delivery.entity';
import type { User } from './user.entity';

export enum DriverAvailability {
  OFFLINE = 'offline',
  ONLINE = 'online',
  ON_DELIVERY = 'on_delivery',
}

@Entity('driver_profiles')
export class DriverProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'userId', unique: true })
  userId!: string;

  @OneToOne('User', (entity: User) => entity.driverProfile, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'userId' })
  user?: Relation<User | null>;

  @Column({ type: 'varchar', length: 50, name: 'vehicleType' })
  vehicleType!: string;

  @Column({
    type: 'varchar',
    length: 20,
    nullable: true,
    name: 'vehiclePlate',
  })
  vehiclePlate!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  license!: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: DriverAvailability.OFFLINE,
  })
  availability!: DriverAvailability;

  @Column({
    type: 'numeric',
    precision: 3,
    scale: 2,
    default: 0.0,
  })
  rating!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ type: 'bigint', default: 0 })
  balance!: string;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updatedAt' })
  updatedAt!: Date;

  @OneToMany('Delivery', (entity: Delivery) => entity.driver, {
    persistence: false,
  })
  deliveries?: Relation<Delivery[]>;
}
