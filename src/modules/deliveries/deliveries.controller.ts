import type { Request } from 'express';
import { getAuditRequestContext } from '../audit/audit-request-context';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Req,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiConflictResponse,
  ApiBadRequestResponse,
  ApiSecurity,
} from '@nestjs/swagger';
import { paginated, PaginationQueryDto } from '../../common/dto/pagination.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { RBACGuard, RequiredRoles } from '../auth/guards/rbac.guard';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { AdminRole } from '../users/entities/admin-role-assignment.entity';
import { User } from '../users/entities/user.entity';
import { DeliveriesService } from './deliveries.service';
import {
  AssignDeliveryDto,
  CancelDeliveryDto,
  CreateDeliveryDto,
  ListDeliveriesQueryDto,
  TransitionDeliveryDto,
} from './dto/delivery.dto';
import {
  DeliveryDetailResponseDto,
  DeliveryResponseDto,
  PaginatedDeliveryHistoryResponseDto,
  PaginatedDeliverySummaryResponseDto,
  toDeliveryHistoryResponse,
  toDeliveryResponse,
  toDeliverySummaryResponse,
  toPickupAddressResponse,
  toRecipientResponse,
} from './dto/delivery-response.dto';

@ApiTags('Deliveries')
@ApiBearerAuth('JWT')
@Controller('deliveries')
@UseGuards(AuthGuard)
export class DeliveriesController {
  constructor(
    private readonly deliveries: DeliveriesService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create new delivery (personal or business)' })
  @ApiSecurity('Idempotency-Key')
  @ApiResponse({
    status: 201,
    description: 'Delivery created successfully',
    type: DeliveryResponseDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid delivery data' })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Business not active or not a member' })
  @ApiConflictResponse({
    description: 'Idempotency key conflict with different payload',
  })
  async create(
    @Body() dto: CreateDeliveryDto,
    @CurrentUser() user: User,
    @Headers('idempotency-key') idempotencyKeyHeader?: string,
  ) {
    // Extract and validate Idempotency-Key header (optional)
    const idempotencyKey = idempotencyKeyHeader
      ? this.idempotency.extractKey({ 'idempotency-key': idempotencyKeyHeader })
      : null;

    // Check for existing idempotency record (replay if found)
    if (idempotencyKey) {
      const cachedResponse = await this.idempotency.checkAndReplay(
        user.id,
        'delivery.create',
        idempotencyKey,
        dto,
      );
      if (cachedResponse) {
        return cachedResponse;
      }
    }

    // Create delivery with optional idempotency key
    const delivery = await this.deliveries.create(
      dto,
      user.id,
      idempotencyKey ?? undefined,
    );
    return toDeliveryResponse(delivery);
  }

  @Get()
  @ApiOperation({ summary: 'List deliveries with pagination and filters' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of deliveries',
    type: PaginatedDeliverySummaryResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async list(@CurrentUser() user: User, @Query() q: ListDeliveriesQueryDto) {
    const items = await this.deliveries.findAll(user.id, {
      businessId: q.businessId,
      driverId: q.driverId,
      status: q.status,
      take: q.take,
      skip: q.skip,
    });
    return paginated(items.map(toDeliverySummaryResponse), q);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get delivery by ID' })
  @ApiResponse({
    status: 200,
    description: 'Delivery found',
    type: DeliveryResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to view this delivery' })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  async getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return toDeliveryResponse(
      await this.deliveries.findAuthorizedById(id, user.id),
    );
  }

  @Get(':id/history')
  @ApiOperation({ summary: 'Get delivery status history' })
  @ApiResponse({
    status: 200,
    description: 'Paginated delivery history',
    type: PaginatedDeliveryHistoryResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to view this delivery' })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  async history(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Query() page: PaginationQueryDto,
  ) {
    const items = await this.deliveries.getHistory(id, user.id, page);
    return paginated(items.map(toDeliveryHistoryResponse), page);
  }

  @Get(':id/details')
  @ApiOperation({
    summary: 'Get delivery details (delivery + recipient + pickup)',
  })
  @ApiResponse({
    status: 200,
    description: 'Delivery details',
    type: DeliveryDetailResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to view this delivery' })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  async details(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    const detail = await this.deliveries.getDetails(id, user.id);
    return {
      delivery: toDeliveryResponse(detail.delivery),
      recipient: toRecipientResponse(detail.recipient),
      pickup: toPickupAddressResponse(detail.pickup),
    };
  }

  @Post(':id/assign')
  @HttpCode(200)
  @UseGuards(RBACGuard)
  @RequiredRoles(AdminRole.ADMIN)
  @ApiSecurity('Idempotency-Key')
  @ApiOperation({
    summary: 'Assign an eligible driver and commit immutable commercial terms',
  })
  @ApiResponse({ status: 200, type: DeliveryResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid driver, version, quote or financial terms',
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Active operations admin and eligible business required',
  })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  @ApiConflictResponse({
    description:
      'Stale state, busy driver, unavailable plan or conflicting replay',
  })
  async assign(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDeliveryDto,
    @CurrentUser() user: User,
    @Req() request: Request,
    @Headers('idempotency-key') key?: string,
  ) {
    const idempotencyKey = this.idempotency.extractKey({
      'idempotency-key': key,
    });
    return toDeliveryResponse(
      await this.deliveries.assign(
        id,
        dto,
        user.id,
        idempotencyKey ?? undefined,
        getAuditRequestContext(request),
      ),
    );
  }

  @Post(':id/transition')
  @HttpCode(200)
  @ApiSecurity('Idempotency-Key')
  @UseGuards(RBACGuard)
  @RequiredRoles(AdminRole.ADMIN)
  @ApiOperation({ summary: 'Admin: transition delivery status' })
  @ApiResponse({
    status: 200,
    description: 'Delivery transitioned successfully',
    type: DeliveryResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  @ApiConflictResponse({ description: 'Invalid state transition' })
  async transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionDeliveryDto,
    @CurrentUser() user: User,
    @Req() request: Request,
    @Headers('idempotency-key') key?: string,
  ) {
    return toDeliveryResponse(
      await this.deliveries.transitionAsAdmin(
        id,
        dto,
        user.id,
        this.idempotency.extractKey({ 'idempotency-key': key }) ?? undefined,
        getAuditRequestContext(request),
      ),
    );
  }

  @Post(':id/cancel')
  @ApiSecurity('Idempotency-Key')
  @ApiOperation({ summary: 'Cancel delivery as sender' })
  @ApiResponse({
    status: 201,
    description: 'Delivery cancelled successfully',
    type: DeliveryResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({
    description: 'Not authorized to cancel this delivery',
  })
  @ApiNotFoundResponse({ description: 'Delivery not found' })
  @ApiConflictResponse({ description: 'Cannot cancel in current status' })
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelDeliveryDto,
    @CurrentUser() user: User,
    @Req() request: Request,
    @Headers('idempotency-key') key?: string,
  ) {
    return toDeliveryResponse(
      await this.deliveries.cancelAsSender(
        id,
        dto,
        user.id,
        this.idempotency.extractKey({ 'idempotency-key': key }) ?? undefined,
        getAuditRequestContext(request),
      ),
    );
  }
}
