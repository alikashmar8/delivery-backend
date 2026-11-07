import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { Business } from '../../businesses/entities/business.entity';
import type { Delivery } from '../../deliveries/entities/delivery.entity';
import type { DriverProfile } from '../../users/entities/driver-profile.entity';
import type { User } from '../../users/entities/user.entity';
import type { BeneficiaryType, LedgerEntryType } from '../ledger-event';
import type { LedgerEvent } from './ledger-event.entity';

@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) eventId!: string;
  @ManyToOne('LedgerEvent', (event: LedgerEvent) => event.entries, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'eventId' })
  event?: Relation<LedgerEvent>;
  @Column({ type: 'smallint' }) eventIndex!: number;
  @Column({ type: 'varchar', length: 40 }) entryType!: LedgerEntryType;
  @Column({ type: 'bigint' }) amount!: string;
  @Column({ type: 'varchar', length: 3 }) currency!: 'USD';
  @Column({ type: 'varchar', length: 10 }) beneficiaryType!: BeneficiaryType;
  @Column({ type: 'uuid', nullable: true }) beneficiaryUserId!: string | null;
  @ManyToOne('User', (user: User) => user.beneficiaryLedgerEntries, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'beneficiaryUserId' })
  beneficiaryUser?: Relation<User | null>;
  @Column({ type: 'uuid', nullable: true }) beneficiaryBusinessId!:
    string | null;
  @ManyToOne('Business', (business: Business) => business.ledgerEntries, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'beneficiaryBusinessId' })
  beneficiaryBusiness?: Relation<Business | null>;
  @Column({ type: 'uuid', nullable: true }) deliveryId!: string | null;
  @ManyToOne('Delivery', (delivery: Delivery) => delivery.ledgerEntries, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'deliveryId' })
  delivery?: Relation<Delivery | null>;
  @Column({ type: 'uuid', nullable: true }) driverId!: string | null;
  @ManyToOne('DriverProfile', (driver: DriverProfile) => driver.ledgerEntries, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'driverId' })
  driver?: Relation<DriverProfile | null>;
  @Column({ type: 'date', nullable: true }) periodStart!: string | null;
  @Column({ type: 'uuid', nullable: true }) reversesEntryId!: string | null;
  @ManyToOne('LedgerEntry', (entry: LedgerEntry) => entry.reversals, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'reversesEntryId' })
  reversesEntry?: Relation<LedgerEntry | null>;
  @OneToMany('LedgerEntry', (entry: LedgerEntry) => entry.reversesEntry, {
    persistence: false,
  })
  reversals?: Relation<LedgerEntry[]>;
  @Column({ type: 'uuid', nullable: true }) replacesEntryId!: string | null;
  @ManyToOne('LedgerEntry', (entry: LedgerEntry) => entry.replacements, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'replacesEntryId' })
  replacesEntry?: Relation<LedgerEntry | null>;
  @OneToMany('LedgerEntry', (entry: LedgerEntry) => entry.replacesEntry, {
    persistence: false,
  })
  replacements?: Relation<LedgerEntry[]>;
  @Column({ type: 'uuid', nullable: true }) adjustsEntryId!: string | null;
  @ManyToOne('LedgerEntry', (entry: LedgerEntry) => entry.adjustments, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'adjustsEntryId' })
  adjustsEntry?: Relation<LedgerEntry | null>;
  @OneToMany('LedgerEntry', (entry: LedgerEntry) => entry.adjustsEntry, {
    persistence: false,
  })
  adjustments?: Relation<LedgerEntry[]>;
  @Column({ type: 'varchar', length: 20 }) referenceType!:
    'delivery' | 'charge' | 'settlement' | 'adjustment';
  @Column({ type: 'uuid' }) referenceId!: string;
  @Column({ type: 'text', nullable: true }) description!: string | null;
  @Column({ type: 'uuid', nullable: true }) createdById!: string | null;
  @ManyToOne('User', (user: User) => user.createdLedgerEntries, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'createdById' })
  createdBy?: Relation<User | null>;
  @Column({ type: 'timestamptz' }) occurredAt!: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
}
