import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { Relation } from 'typeorm';
import type {
  Delivery,
  DeliveryFeeBreakdown,
  PaymentMethod,
} from '../../deliveries/entities/delivery.entity';
import type { PricingRule } from '../../pricing/entities/pricing-rule.entity';
import type { DriverCompensationPlan } from './driver-compensation-plan.entity';
import type { DriverPlanAssignment } from './driver-plan-assignment.entity';

@Entity('delivery_financial_snapshots')
export class DeliveryFinancialSnapshot {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'uuid', unique: true }) deliveryId!: string;
  @OneToOne('Delivery', (delivery: Delivery) => delivery.financialSnapshot, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'deliveryId' })
  delivery?: Relation<Delivery>;
  @Column({ type: 'varchar', length: 3 }) currency!: string;
  @Column({ type: 'bigint' }) customerDeliveryFee!: string;
  @Column({ type: 'jsonb' }) eligibleFeeComponents!: DeliveryFeeBreakdown & {
    totalEligibleFee: string;
    paymentMethod: PaymentMethod;
  };
  @Column({ type: 'bigint' }) driverEarnings!: string;
  @Column({ type: 'bigint' }) platformDeliveryRevenue!: string;
  @Column({ type: 'uuid', nullable: true }) pricingRuleId!: string | null;
  @ManyToOne('PricingRule', (rule: PricingRule) => rule.financialSnapshots, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'pricingRuleId' })
  pricingRule?: Relation<PricingRule | null>;
  @Column({ type: 'uuid', nullable: true }) driverCompensationPlanId!:
    string | null;
  @ManyToOne(
    'DriverCompensationPlan',
    (plan: DriverCompensationPlan) => plan.financialSnapshots,
    { nullable: true, onDelete: 'SET NULL' },
  )
  @JoinColumn({ name: 'driverCompensationPlanId' })
  driverCompensationPlan?: Relation<DriverCompensationPlan | null>;
  @Column({ type: 'uuid', nullable: true }) driverPlanAssignmentId!:
    string | null;
  @ManyToOne(
    'DriverPlanAssignment',
    (assignment: DriverPlanAssignment) => assignment.financialSnapshots,
    { nullable: true, onDelete: 'SET NULL' },
  )
  @JoinColumn({ name: 'driverPlanAssignmentId' })
  driverPlanAssignment?: Relation<DriverPlanAssignment | null>;
  @Column({ type: 'timestamptz' }) lockedAt!: Date;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt!: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt!: Date;
}
