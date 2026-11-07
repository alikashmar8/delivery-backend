import { FinanceModule } from '../finance/finance.module';
import { AuditModule } from '../audit/audit.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BusinessesModule } from '../businesses/businesses.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { PricingModule } from '../pricing/pricing.module';
import { ZonesModule } from '../zones/zones.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { DeliveriesController } from './deliveries.controller';
import { DeliveriesService } from './deliveries.service';
import { DeliveryAddress } from './entities/delivery-address.entity';
import { DeliveryStatusHistory } from './entities/delivery-status-history.entity';
import { Delivery } from './entities/delivery.entity';
import { Recipient } from './entities/recipient.entity';

@Module({
  imports: [
    FinanceModule,
    AuditModule,
    TypeOrmModule.forFeature([
      Delivery,
      Recipient,
      DeliveryAddress,
      DeliveryStatusHistory,
    ]),
    UsersModule,
    BusinessesModule,
    AuthModule,
    PricingModule,
    ZonesModule,
    IdempotencyModule,
  ],
  controllers: [DeliveriesController],
  providers: [DeliveriesService],
  exports: [DeliveriesService, TypeOrmModule],
})
export class DeliveriesModule {}
