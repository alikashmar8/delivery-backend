import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { paginated, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { getAuditRequestContext } from '../audit/audit-request-context';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RBACGuard, RequiredRoles } from '../auth/guards/rbac.guard';
import { AdminRole } from '../users/entities/admin-role-assignment.entity';
import { User } from '../users/entities/user.entity';
import {
  CreateAssignmentDto,
  CreatePlanDto,
  AssignmentResponseDto,
  PaginatedAssignmentResponseDto,
  PaginatedPlanResponseDto,
  PlanResponseDto,
  RetirePlanDto,
} from './dto/finance.dto';
import { FinanceService } from './finance.service';

@ApiTags('Driver compensation')
@ApiBearerAuth('JWT')
@ApiUnauthorizedResponse({ description: 'Authentication required' })
@ApiForbiddenResponse({ description: 'Admin permission required' })
@Controller()
@UseGuards(AuthGuard, RBACGuard)
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Post('driver-compensation-plans')
  @ApiOperation({ summary: 'Create immutable driver compensation terms' })
  @RequiredRoles(AdminRole.SUPER_ADMIN)
  @ApiCreatedResponse({ type: PlanResponseDto })
  async createPlan(
    @CurrentUser() actor: User,
    @Body() dto: CreatePlanDto,
    @Req() request: Request,
  ) {
    return await this.finance.createPlan(
      actor.id,
      dto,
      getAuditRequestContext(request),
    );
  }

  @Get('driver-compensation-plans')
  @ApiOperation({ summary: 'List driver compensation plans' })
  @RequiredRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOkResponse({ type: PaginatedPlanResponseDto })
  async listPlans(@Query() page: PaginationQueryDto) {
    return paginated(await this.finance.listPlans(page.take, page.skip), page);
  }

  @Get('driver-compensation-plans/:id')
  @ApiOperation({ summary: 'Get a driver compensation plan' })
  @RequiredRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOkResponse({ type: PlanResponseDto })
  async getPlan(@Param('id', ParseUUIDPipe) id: string) {
    return await this.finance.getPlan(id);
  }

  @Patch('driver-compensation-plans/:id/retirement')
  @ApiOperation({
    summary: 'Retire a driver compensation plan after its assignments end',
  })
  @RequiredRoles(AdminRole.SUPER_ADMIN)
  @ApiOkResponse({ type: PlanResponseDto })
  async retirePlan(
    @CurrentUser() actor: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RetirePlanDto,
    @Req() request: Request,
  ) {
    return await this.finance.retirePlan(
      actor.id,
      id,
      dto.effectiveTo,
      getAuditRequestContext(request),
    );
  }

  @Post('drivers/:driverId/plan-assignments')
  @ApiOperation({ summary: 'Assign compensation terms to a driver' })
  @RequiredRoles(AdminRole.SUPER_ADMIN)
  @ApiCreatedResponse({ type: AssignmentResponseDto })
  async assignPlan(
    @CurrentUser() actor: User,
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: CreateAssignmentDto,
    @Req() request: Request,
  ) {
    return await this.finance.assignPlan(
      actor.id,
      driverId,
      dto,
      getAuditRequestContext(request),
    );
  }

  @Get('drivers/:driverId/plan-assignments')
  @ApiOperation({ summary: 'List a driver’s compensation assignment history' })
  @RequiredRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOkResponse({ type: PaginatedAssignmentResponseDto })
  async listAssignments(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Query() page: PaginationQueryDto,
  ) {
    return paginated(
      await this.finance.listAssignments(driverId, page.take, page.skip),
      page,
    );
  }
}
