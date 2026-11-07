import type { DeliveryFinancialSnapshot } from './delivery-financial-snapshot.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { DriverPlanAssignment } from './driver-plan-assignment.entity';
import type { PlanComponents } from '../plan-allocation';

export enum PlanType {
  PER_DELIVERY = 'PER_DELIVERY',
  DAILY = 'DAILY',
  MONTHLY = 'MONTHLY',
  HYBRID = 'HYBRID',
}

@Entity('driver_compensation_plans')
export class DriverCompensationPlan {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 255 }) name!: string;
  @Column({ type: 'varchar', length: 20 }) type!: PlanType;
  @Column({ type: 'boolean', default: true }) active!: boolean;
  @Column({ type: 'jsonb' }) components!: PlanComponents;
  @Column({ type: 'timestamptz', default: () => 'now()' }) effectiveFrom!: Date;
  @Column({ type: 'timestamptz', nullable: true }) effectiveTo!: Date | null;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
  @OneToMany(
    'DriverPlanAssignment',
    (assignment: DriverPlanAssignment) => assignment.plan,
    { persistence: false },
  )
  assignments?: Relation<DriverPlanAssignment[]>;

  @OneToMany(
    'DeliveryFinancialSnapshot',
    (snapshot: DeliveryFinancialSnapshot) => snapshot.driverCompensationPlan,
    { persistence: false },
  )
  financialSnapshots?: Relation<DeliveryFinancialSnapshot[]>;
}
