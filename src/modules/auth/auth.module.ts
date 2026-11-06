import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { AdminRoleAssignment } from '../users/entities/admin-role-assignment.entity';
import { RefreshToken } from '../users/entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RBACGuard } from './guards/rbac.guard';
import { MemoryOtpProvider, OTP_PROVIDER } from './otp/otp-provider';
import { MemoryOtpState, OTP_STATE } from './otp/otp-state';
import { RedisOtpState } from './otp/redis-otp-state';

/**
 * OTP backing store selection. `memory` is single-instance state for tests
 * and local development; `redis` shares challenges, proofs and rate-limit
 * counters across replicas with TTL expiry. Defaults to memory in `test`
 * (unit/integration suites stay hermetic) and redis elsewhere.
 */
function resolveOtpStoreKind(config: ConfigService): 'memory' | 'redis' {
  const configured = config.get<string>('OTP_STATE') ?? process.env.OTP_STATE;
  if (configured === 'memory' || configured === 'redis') return configured;
  const appEnv =
    config.get<string>('app.env') ??
    config.get<string>('APP_ENV') ??
    process.env.APP_ENV ??
    'development';
  return appEnv === 'test' ? 'memory' : 'redis';
}

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RefreshToken, AdminRoleAssignment]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('jwt.accessSecret'),
        signOptions: {
          expiresIn: (config.get<string>('jwt.accessExpiration') ??
            '15m') as any,
        },
      }),
      global: true,
    }),
    UsersModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    RBACGuard,
    { provide: OTP_PROVIDER, useClass: MemoryOtpProvider },
    {
      provide: OTP_STATE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (resolveOtpStoreKind(config) === 'memory') {
          return new MemoryOtpState();
        }
        const client = new Redis({
          host:
            config.get<string>('redis.host') ??
            process.env.REDIS_HOST ??
            'localhost',
          port: Number(
            config.get<string>('redis.port') ?? process.env.REDIS_PORT ?? 6379,
          ),
          lazyConnect: true,
          maxRetriesPerRequest: 3,
        });
        // Command failures reject per call (mapped to 503 by AuthService);
        // keep connection-level noise out of request logs.
        client.on('error', () => undefined);
        return new RedisOtpState(client);
      },
    },
  ],
  exports: [AuthService, RBACGuard, OTP_PROVIDER, OTP_STATE],
})
export class AuthModule {}
