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
import type { User } from '../../users/entities/user.entity';
import type { LedgerEventKind } from '../ledger-event';
import type { LedgerEntry } from './ledger-entry.entity';

@Entity('ledger_events')
export class LedgerEvent {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 20 }) kind!: LedgerEventKind;
  @Column({ type: 'uuid' }) sourceId!: string;
  @Column({ type: 'varchar', length: 64 }) payloadHash!: string;
  @Column({ type: 'smallint' }) entryCount!: number;
  @Column({ type: 'uuid', nullable: true }) createdById!: string | null;
  @ManyToOne('User', (user: User) => user.createdLedgerEvents, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'createdById' })
  createdBy?: Relation<User | null>;
  @Column({ type: 'timestamptz' }) occurredAt!: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @OneToMany('LedgerEntry', (entry: LedgerEntry) => entry.event, {
    persistence: false,
  })
  entries?: Relation<LedgerEntry[]>;
}
