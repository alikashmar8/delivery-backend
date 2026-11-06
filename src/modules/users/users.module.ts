import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AdminRoleAssignment } from './entities/admin-role-assignment.entity';
import { DriverProfile } from './entities/driver-profile.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { User } from './entities/user.entity';
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
    ]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [TypeOrmModule, UsersService],
})
export class UsersModule {}
