import { DeliveryFinancialSnapshot } from './entities/delivery-financial-snapshot.entity';
import { LedgerEntry } from './entities/ledger-entry.entity';
import { LedgerEvent } from './entities/ledger-event.entity';
import { LedgerService } from './ledger.service';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AdminRoleAssignment } from '../users/entities/admin-role-assignment.entity';
import { DriverProfile } from '../users/entities/driver-profile.entity';
import { User } from '../users/entities/user.entity';
import { DriverCompensationPlan } from './entities/driver-compensation-plan.entity';
import { DriverPlanAssignment } from './entities/driver-plan-assignment.entity';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';

@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([
      DeliveryFinancialSnapshot,
      LedgerEntry,
      LedgerEvent,
      AdminRoleAssignment,
      User,
      DriverProfile,
      DriverCompensationPlan,
      DriverPlanAssignment,
    ]),
  ],
  controllers: [FinanceController],
  providers: [FinanceService, LedgerService],
  exports: [FinanceService, LedgerService],
})
export class FinanceModule {}
