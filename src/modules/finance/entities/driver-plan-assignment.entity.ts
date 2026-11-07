import type { DeliveryFinancialSnapshot } from './delivery-financial-snapshot.entity';
import {
  Column,
  OneToMany,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type { DriverProfile } from '../../users/entities/driver-profile.entity';
import type { User } from '../../users/entities/user.entity';
import type { DriverCompensationPlan } from './driver-compensation-plan.entity';

@Entity('driver_plan_assignments')
export class DriverPlanAssignment {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid' }) driverId!: string;
  @ManyToOne(
    'DriverProfile',
    (driver: DriverProfile) => driver.planAssignments,
    { nullable: false, onDelete: 'RESTRICT' },
  )
  @JoinColumn({ name: 'driverId' })
  driver?: Relation<DriverProfile>;
  @Column({ type: 'uuid' }) planId!: string;
  @ManyToOne(
    'DriverCompensationPlan',
    (plan: DriverCompensationPlan) => plan.assignments,
    { nullable: false, onDelete: 'RESTRICT' },
  )
  @JoinColumn({ name: 'planId' })
  plan?: Relation<DriverCompensationPlan>;
  @Column({ type: 'timestamptz' }) effectiveFrom!: Date;
  @Column({ type: 'timestamptz', nullable: true }) effectiveTo!: Date | null;
  @Column({ type: 'uuid' }) createdById!: string;
  @ManyToOne('User', (user: User) => user.createdPlanAssignments, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'createdById' })
  createdBy?: Relation<User>;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;

  @OneToMany(
    'DeliveryFinancialSnapshot',
    (snapshot: DeliveryFinancialSnapshot) => snapshot.driverPlanAssignment,
    { persistence: false },
  )
  financialSnapshots?: Relation<DeliveryFinancialSnapshot[]>;
}
