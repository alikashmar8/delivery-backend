import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { BusinessesController } from './businesses.controller';
import { BusinessesService } from './businesses.service';
import { BusinessMember } from './entities/business-member.entity';
import { Business } from './entities/business.entity';
import { BusinessScopeGuard } from './guards/business-scope.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([Business, BusinessMember]),
    UsersModule,
    AuditModule,
  ],
  controllers: [BusinessesController],
  providers: [BusinessesService, BusinessScopeGuard],
  exports: [BusinessesService, TypeOrmModule],
})
export class BusinessesModule {}
