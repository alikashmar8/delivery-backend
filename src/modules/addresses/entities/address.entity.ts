import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { Region } from '../../regions/entities/region.entity';
import type { User } from '../../users/entities/user.entity';

@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'userId' })
  userId!: string;

  @ManyToOne('User', (entity: User) => entity.addresses, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user?: Relation<User | null>;

  @Column({ type: 'varchar', length: 2, default: 'LB', name: 'countryCode' })
  countryCode!: string;

  @Column({ type: 'uuid', nullable: true, name: 'regionId' })
  regionId!: string | null;

  @ManyToOne('Region', (entity: Region) => entity.addresses, {
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

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  latitude!: number | null;

  @Column({ type: 'numeric', precision: 10, scale: 7, nullable: true })
  longitude!: number | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  label!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updatedAt' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deletedAt' })
  deletedAt!: Date | null;
}
