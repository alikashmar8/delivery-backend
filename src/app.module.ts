import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { LoggerModule } from 'nestjs-pino';
import configs from './config/index';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { BusinessesModule } from './modules/businesses/businesses.module';
import { DeliveriesModule } from './modules/deliveries/deliveries.module';
import { FinanceModule } from './modules/finance/finance.module';
import { PricingModule } from './modules/pricing/pricing.module';
import { RegionsModule } from './modules/regions/regions.module';
import { UsersModule } from './modules/users/users.module';
import { ZonesModule } from './modules/zones/zones.module';
import { validateEnvironment } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: configs,
      validate: validateEnvironment,
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        redact: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers.set-cookie',
        ],
      },
    }),
    DatabaseModule,
    HealthModule,
    AuditModule,
    AuthModule,
    UsersModule,
    BusinessesModule,
    RegionsModule,
    AddressesModule,
    ZonesModule,
    PricingModule,
    DeliveriesModule,
    FinanceModule,
  ],
})
export class AppModule {}
