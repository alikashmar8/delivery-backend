import type { Relation } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Delivery } from './delivery.entity';

export enum ActorType {
  USER = 'user',
  DRIVER = 'driver',
  BUSINESS = 'business',
  SYSTEM = 'system',
  ADMIN = 'admin',
}

@Entity('delivery_status_history')
export class DeliveryStatusHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'deliveryId' })
  deliveryId!: string;

  @ManyToOne('Delivery', (entity: Delivery) => entity.statusHistory, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'deliveryId' })
  delivery?: Relation<Delivery>;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'fromStatus' })
  fromStatus!: string | null;

  @Column({ type: 'varchar', length: 20, name: 'toStatus' })
  toStatus!: string;

  @Column({ type: 'varchar', length: 20, name: 'actorType' })
  actorType!: ActorType;

  @Column({ type: 'uuid', nullable: true, name: 'actorId' })
  actorId!: string | null;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'occurredAt' })
  occurredAt!: Date;
}
