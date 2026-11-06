import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
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
} from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CreateZoneDto, UpdateZoneDto } from './dto/zone.dto';
import { ZonesService } from './zones.service';
import { PaginationQueryDto, paginated } from '../../common/dto/pagination.dto';
import {
  DeliveryZoneResponseDto,
  PaginatedDeliveryZoneResponseDto,
  toDeliveryZoneResponse,
} from './dto/zone-response.dto';
import { MessageResponseDto } from '../../common/dto/response.dto';

class ListZonesQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsUUID()
  businessId?: string;
}

@ApiTags('Delivery Zones')
@ApiBearerAuth('JWT')
@Controller('delivery-zones')
@UseGuards(AuthGuard)
export class ZonesController {
  constructor(private readonly zones: ZonesService) {}

  @Post()
  @ApiOperation({ summary: 'Create delivery zone (platform or business)' })
  @ApiResponse({
    status: 201,
    description: 'Zone created successfully',
    type: DeliveryZoneResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Business not active or not a member' })
  async create(@Body() dto: CreateZoneDto, @CurrentUser() user: User) {
    return toDeliveryZoneResponse(
      await this.zones.create(user.id, {
        name: dto.name,
        businessId: dto.businessId ?? null,
        boundary: dto.boundary,
        active: dto.active,
      }),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List delivery zones with pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of zones',
    type: PaginatedDeliveryZoneResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async list(@Query() query: ListZonesQueryDto, @CurrentUser() user: User) {
    const items = await this.zones.findAll(
      user.id,
      query.businessId ?? null,
      query,
    );
    return paginated(items.map(toDeliveryZoneResponse), query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get zone by ID' })
  @ApiResponse({
    status: 200,
    description: 'Zone found',
    type: DeliveryZoneResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to view this zone' })
  @ApiNotFoundResponse({ description: 'Zone not found' })
  async getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return toDeliveryZoneResponse(
      await this.zones.findAuthorizedById(id, user.id),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update delivery zone' })
  @ApiResponse({
    status: 200,
    description: 'Zone updated successfully',
    type: DeliveryZoneResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized or business suspended' })
  @ApiNotFoundResponse({ description: 'Zone not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateZoneDto,
    @CurrentUser() user: User,
  ) {
    return toDeliveryZoneResponse(await this.zones.update(id, user.id, dto));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate delivery zone' })
  @ApiResponse({
    status: 200,
    description: 'Zone deactivated successfully',
    type: MessageResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized or business suspended' })
  @ApiNotFoundResponse({ description: 'Zone not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.zones.remove(id, user.id);
    return { message: 'Zone deactivated' };
  }
}
