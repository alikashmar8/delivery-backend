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
import type { Business } from './business.entity';
import type { User } from '../../users/entities/user.entity';

export enum BusinessMemberRole {
  OWNER = 'owner',
  MANAGER = 'manager',
  OPERATOR = 'operator',
  ACCOUNTANT = 'accountant',
}

export enum BusinessMemberStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
}

@Entity('business_members')
export class BusinessMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'businessId' })
  businessId!: string;

  @ManyToOne('Business', (entity: Business) => entity.members, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'businessId' })
  business?: Relation<Business>;

  @Column({ type: 'uuid', name: 'userId' })
  userId!: string;

  @ManyToOne('User', (entity: User) => entity.businessMemberships, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'userId' })
  user?: Relation<User | null>;

  @Column({ type: 'varchar', length: 20, default: BusinessMemberRole.OWNER })
  role!: BusinessMemberRole;

  @Column({ type: 'varchar', length: 20, default: BusinessMemberStatus.ACTIVE })
  status!: BusinessMemberStatus;

  @CreateDateColumn({ type: 'timestamptz', name: 'createdAt' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updatedAt' })
  updatedAt!: Date;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deletedAt' })
  deletedAt!: Date | null;
}
