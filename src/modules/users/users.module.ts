import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { Delivery } from '../deliveries/entities/delivery.entity';
import { AdminRoleAssignment } from './entities/admin-role-assignment.entity';
import { DriverProfile } from './entities/driver-profile.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';
import { DriversController } from './drivers.controller';
import { DriversService } from './drivers.service';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    AuditModule,
    TypeOrmModule.forFeature([
      User,
      RefreshToken,
      DriverProfile,
      AdminRoleAssignment,
      Delivery,
    ]),
  ],
  controllers: [UsersController, DriversController],
  providers: [UsersService, DriversService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
