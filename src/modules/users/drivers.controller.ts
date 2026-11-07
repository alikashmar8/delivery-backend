import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { paginated, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { getAuditRequestContext } from '../audit/audit-request-context';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RBACGuard, RequiredRoles } from '../auth/guards/rbac.guard';
import {
  PaginatedDeliverySummaryResponseDto,
  toDeliverySummaryResponse,
} from '../deliveries/dto/delivery-response.dto';
import { AdminRole } from './entities/admin-role-assignment.entity';
import { User } from './entities/user.entity';
import {
  CreateDriverProfileDto,
  ListDriversQueryDto,
  SetDriverActiveDto,
  SetMyAvailabilityDto,
} from './dto/driver.dto';
import {
  DriverOperationResponseDto,
  DriverProfileResponseDto,
  PaginatedDriverListResponseDto,
  toDriverListItemResponse,
  toDriverOperationResponse,
  toDriverProfileResponse,
} from './dto/driver-response.dto';
import { DriversService } from './drivers.service';

@ApiTags('Drivers')
@ApiBearerAuth('JWT')
@Controller()
@UseGuards(AuthGuard)
export class DriversController {
  constructor(private readonly drivers: DriversService) {}

  @Post('users/:userId/driver-profile')
  @UseGuards(RBACGuard)
  @RequiredRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({
    summary: 'Admin: onboard an inactive driver profile',
    description:
      'The profile starts inactive and offline. Approval is a separate explicit operation.',
  })
  @ApiCreatedResponse({ type: DriverProfileResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Active admin role required' })
  @ApiNotFoundResponse({ description: 'User not found' })
  @ApiConflictResponse({ description: 'User already has a driver profile' })
  async createProfile(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: CreateDriverProfileDto,
    @CurrentUser() actor: User,
    @Req() request: Request,
  ) {
    return toDriverProfileResponse(
      await this.drivers.createProfile(
        actor.id,
        userId,
        dto,
        getAuditRequestContext(request),
      ),
    );
  }

  @Get('drivers')
  @UseGuards(RBACGuard)
  @RequiredRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.SUPPORT)
  @ApiOperation({ summary: 'Admin: list driver operations profiles' })
  @ApiResponse({ status: 200, type: PaginatedDriverListResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin or support role required' })
  async list(@Query() query: ListDriversQueryDto) {
    const drivers = await this.drivers.listDrivers(query);
    return paginated(
      drivers.map(({ profile, user }) =>
        toDriverListItemResponse(profile, user),
      ),
      query,
    );
  }

  @Get('drivers/me')
  @ApiOperation({ summary: 'Get my driver profile and approval state' })
  @ApiResponse({ status: 200, type: DriverProfileResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiNotFoundResponse({ description: 'Driver profile not found' })
  async getMyProfile(@CurrentUser() user: User) {
    return toDriverProfileResponse(await this.drivers.findMyProfile(user.id));
  }

  @Patch('drivers/:driverId/activation')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RBACGuard)
  @RequiredRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN)
  @ApiOperation({
    summary: 'Admin: approve or deactivate a driver profile',
    description: 'Deactivation always forces the driver offline.',
  })
  @ApiResponse({ status: 200, type: DriverOperationResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Active admin role required' })
  @ApiNotFoundResponse({ description: 'Driver profile not found' })
  @ApiConflictResponse({ description: 'Driver profile version is stale' })
  async setActive(
    @Param('driverId', ParseUUIDPipe) driverId: string,
    @Body() dto: SetDriverActiveDto,
    @CurrentUser() actor: User,
    @Req() request: Request,
  ) {
    const result = await this.drivers.setActive(
      actor.id,
      driverId,
      dto.active,
      dto.expectedVersion,
      getAuditRequestContext(request),
    );
    return toDriverOperationResponse(result.profile, result.changed);
  }

  @Post('drivers/me/availability')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Set my online or offline availability',
    description: 'Only active driver profiles may change availability.',
  })
  @ApiResponse({ status: 200, type: DriverOperationResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Driver approval is required' })
  @ApiConflictResponse({ description: 'Driver profile version is stale' })
  async setMyAvailability(
    @Body() dto: SetMyAvailabilityDto,
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    const result = await this.drivers.setMyAvailability(
      user.id,
      dto.availability,
      dto.expectedVersion,
      getAuditRequestContext(request),
    );
    return toDriverOperationResponse(result.profile, result.changed);
  }

  @Get('drivers/me/deliveries')
  @ApiOperation({
    summary: 'Get my active driver queue',
    description:
      "Returns only this active driver profile's non-terminal queue.",
  })
  @ApiResponse({ status: 200, type: PaginatedDeliverySummaryResponseDto })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Driver approval is required' })
  async listMyQueue(
    @CurrentUser() user: User,
    @Query() page: PaginationQueryDto,
  ) {
    const deliveries = await this.drivers.listMyQueue(
      user.id,
      page.take,
      page.skip,
    );
    return paginated(deliveries.map(toDeliverySummaryResponse), page);
  }
}
