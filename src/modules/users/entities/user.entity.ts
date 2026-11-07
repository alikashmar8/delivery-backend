import type { LedgerEvent } from '../../finance/entities/ledger-event.entity';
import type { LedgerEntry } from '../../finance/entities/ledger-entry.entity';
import type { Relation } from 'typeorm';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Address } from '../../addresses/entities/address.entity';
import type { BusinessMember } from '../../businesses/entities/business-member.entity';
import type { Delivery } from '../../deliveries/entities/delivery.entity';
import type { DriverPlanAssignment } from '../../finance/entities/driver-plan-assignment.entity';
import type { Recipient } from '../../deliveries/entities/recipient.entity';
import type { AdminRoleAssignment } from './admin-role-assignment.entity';
import type { DriverProfile } from './driver-profile.entity';
import type { RefreshToken } from './refresh-token.entity';

export enum UserStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  phone!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    name: 'passwordHash',
  })
  passwordHash!: string | null;

  @Column({ type: 'varchar', length: 255, name: 'displayName' })
  displayName!: string;

  @Column({ type: 'varchar', length: 10, default: 'en' })
  locale!: string;

  @Column({ type: 'varchar', length: 2, default: 'LB' })
  country!: string;

  @Column({ type: 'varchar', length: 20, default: UserStatus.ACTIVE })
  status!: UserStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updatedAt' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deletedAt' })
  deletedAt!: Date | null;

  @OneToMany('RefreshToken', (entity: RefreshToken) => entity.user, {
    persistence: false,
  })
  refreshTokens?: Relation<RefreshToken[]>;

  @OneToOne('DriverProfile', (entity: DriverProfile) => entity.user, {
    persistence: false,
  })
  driverProfile?: Relation<DriverProfile | null>;

  @OneToMany(
    'AdminRoleAssignment',
    (entity: AdminRoleAssignment) => entity.user,
    { persistence: false },
  )
  adminRoleAssignments?: Relation<AdminRoleAssignment[]>;

  @OneToMany(
    'AdminRoleAssignment',
    (entity: AdminRoleAssignment) => entity.grantedBy,
    { persistence: false },
  )
  grantedAdminRoleAssignments?: Relation<AdminRoleAssignment[]>;

  @OneToMany('BusinessMember', (entity: BusinessMember) => entity.user, {
    persistence: false,
  })
  businessMemberships?: Relation<BusinessMember[]>;

  @OneToMany('Address', (entity: Address) => entity.user, {
    persistence: false,
  })
  addresses?: Relation<Address[]>;

  @OneToMany('Delivery', (entity: Delivery) => entity.createdByUser, {
    persistence: false,
  })
  createdDeliveries?: Relation<Delivery[]>;

  @OneToMany('Recipient', (entity: Recipient) => entity.user, {
    persistence: false,
  })
  recipientSnapshots?: Relation<Recipient[]>;

  @OneToMany(
    'DriverPlanAssignment',
    (assignment: DriverPlanAssignment) => assignment.createdBy,
    { persistence: false },
  )
  createdPlanAssignments?: Relation<DriverPlanAssignment[]>;

  @OneToMany('LedgerEvent', (entry: LedgerEvent) => entry.createdBy, {
    persistence: false,
  })
  createdLedgerEvents?: Relation<LedgerEvent[]>;

  @OneToMany('LedgerEntry', (entry: LedgerEntry) => entry.createdBy, {
    persistence: false,
  })
  createdLedgerEntries?: Relation<LedgerEntry[]>;

  @OneToMany('LedgerEntry', (entry: LedgerEntry) => entry.beneficiaryUser, {
    persistence: false,
  })
  beneficiaryLedgerEntries?: Relation<LedgerEntry[]>;
}
