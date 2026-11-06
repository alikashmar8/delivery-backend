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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { AuthGuard } from '../auth/guards/auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import {
  ComputeFeeDto,
  CreatePricingRuleDto,
  ListPricingRulesQueryDto,
  UpdatePricingRuleDto,
} from './dto/pricing-rule.dto';
import { PricingService } from './pricing.service';
import { paginated } from '../../common/dto/pagination.dto';
import {
  FeeBreakdownResponseDto,
  PaginatedPricingRuleResponseDto,
  PricingRuleResponseDto,
  toPricingRuleResponse,
} from './dto/pricing-response.dto';
import { MessageResponseDto } from '../../common/dto/response.dto';
import { getAuditRequestContext } from '../audit/audit-request-context';

@ApiTags('Pricing Rules')
@ApiBearerAuth('JWT')
@Controller('pricing-rules')
@UseGuards(AuthGuard)
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  @Post()
  @ApiOperation({ summary: 'Create pricing rule (platform or business)' })
  @ApiResponse({
    status: 201,
    description: 'Pricing rule created successfully',
    type: PricingRuleResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Business not active or not a member' })
  async create(
    @Body() dto: CreatePricingRuleDto,
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    return toPricingRuleResponse(
      await this.pricing.create(
        user.id,
        dto,
        getAuditRequestContext(request),
      ),
    );
  }

  @Get()
  @ApiOperation({ summary: 'List pricing rules with pagination' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of pricing rules',
    type: PaginatedPricingRuleResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async list(
    @Query() query: ListPricingRulesQueryDto,
    @CurrentUser() user: User,
  ) {
    const items = await this.pricing.findAll(
      user.id,
      query.businessId ?? null,
      query,
    );
    return paginated(items.map(toPricingRuleResponse), query);
  }

  @Post('compute')
  @ApiOperation({ summary: 'Compute delivery fee based on pricing rules' })
  @ApiResponse({
    status: 200,
    description: 'Fee breakdown computed',
    type: FeeBreakdownResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Business not active or not a member' })
  async compute(@Body() dto: ComputeFeeDto, @CurrentUser() user: User) {
    return await this.pricing.computeFee(user.id, {
      businessId: dto.businessId ?? null,
      zoneId: dto.zoneId ?? null,
      codAmount: dto.codAmount,
      distanceKm: dto.distanceKm,
      currency: dto.currency,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get pricing rule by ID' })
  @ApiResponse({
    status: 200,
    description: 'Pricing rule found',
    type: PricingRuleResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized to view this rule' })
  @ApiNotFoundResponse({ description: 'Pricing rule not found' })
  async getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return toPricingRuleResponse(
      await this.pricing.findAuthorizedById(id, user.id),
    );
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update pricing rule' })
  @ApiResponse({
    status: 200,
    description: 'Pricing rule updated successfully',
    type: PricingRuleResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized or business suspended' })
  @ApiNotFoundResponse({ description: 'Pricing rule not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePricingRuleDto,
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    return toPricingRuleResponse(
      await this.pricing.update(
        id,
        user.id,
        dto,
        getAuditRequestContext(request),
      ),
    );
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Deactivate pricing rule' })
  @ApiResponse({
    status: 200,
    description: 'Pricing rule deactivated',
    type: MessageResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized or business suspended' })
  @ApiNotFoundResponse({ description: 'Pricing rule not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Req() request: Request,
  ) {
    await this.pricing.deactivate(
      id,
      user.id,
      getAuditRequestContext(request),
    );
    return { message: 'Pricing rule deactivated' };
  }
}
