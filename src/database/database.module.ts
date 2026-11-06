import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SafeTypeOrmLogger } from './safe-typeorm-logger';

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        database: config.get<string>('database.name'),
        username: config.get<string>('database.user'),
        password: config.get<string>('database.password'),
        autoLoadEntities: true,
        synchronize: false,
        // Never log SQL parameters (tokens/hashes/PII); logger controls that, not this flag.
        logging: config.get<string>('app.env') !== 'production',
        logger: new SafeTypeOrmLogger(),
      }),
    }),
  ],
})
export class DatabaseModule {}
