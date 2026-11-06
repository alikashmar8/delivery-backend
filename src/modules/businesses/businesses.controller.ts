import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
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
  ApiConflictResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { User } from '../users/entities/user.entity';
import { BusinessesService } from './businesses.service';
import { CreateBusinessDto } from './dto/business.dto';
import { BusinessScopeGuard } from './guards/business-scope.guard';
import { PaginationQueryDto, paginated } from '../../common/dto/pagination.dto';
import {
  BusinessResponseDto,
  PaginatedBusinessMemberResponseDto,
  PaginatedBusinessResponseDto,
  toBusinessMemberResponse,
  toBusinessResponse,
} from './dto/business-response.dto';
import { MessageResponseDto } from '../../common/dto/response.dto';
import { getAuditRequestContext } from '../audit/audit-request-context';

@ApiTags('Businesses')
@ApiBearerAuth('JWT')
@Controller('businesses')
@UseGuards(AuthGuard)
export class BusinessesController {
  constructor(private readonly businessesService: BusinessesService) {}

  @Post()
  @ApiOperation({ summary: 'Create new business' })
  @ApiResponse({
    status: 201,
    description: 'Business created successfully',
    type: BusinessResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiConflictResponse({ description: 'Business slug already exists' })
  async create(@CurrentUser() user: User, @Body() dto: CreateBusinessDto) {
    const business = await this.businessesService.create(user.id, {
      name: dto.name,
      slug: dto.slug,
      contactPhone: dto.contactPhone,
      legalName: dto.legalName,
    });
    return toBusinessResponse(business);
  }

  @Get('me')
  @ApiOperation({ summary: 'List my businesses (where I am a member)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of businesses',
    type: PaginatedBusinessResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getMyBusinesses(
    @CurrentUser() user: User,
    @Query() page: PaginationQueryDto,
  ) {
    const items = await this.businessesService.findUserBusinesses(
      user.id,
      page,
    );
    return paginated(items, page);
  }

  @Get(':id')
  @UseGuards(BusinessScopeGuard)
  @ApiOperation({ summary: 'Get business by ID' })
  @ApiResponse({
    status: 200,
    description: 'Business found',
    type: BusinessResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not a member of this business' })
  @ApiNotFoundResponse({ description: 'Business not found' })
  async getBusiness(@Param('id', ParseUUIDPipe) id: string) {
    return await this.businessesService.findSummaryById(id);
  }

  @Get(':id/members')
  @UseGuards(BusinessScopeGuard)
  @ApiOperation({ summary: 'List business members' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of members',
    type: PaginatedBusinessMemberResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not a member of this business' })
  async getMembers(
    @Param('id', ParseUUIDPipe) businessId: string,
    @Query() page: PaginationQueryDto,
  ) {
    const members = await this.businessesService.findMembers(businessId, page);
    return paginated(members.map(toBusinessMemberResponse), page);
  }

  @Delete(':id/members/:userId')
  @UseGuards(BusinessScopeGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove member from business' })
  @ApiResponse({
    status: 200,
    description: 'Member removed successfully',
    type: MessageResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not authorized or business suspended' })
  @ApiNotFoundResponse({ description: 'Business or member not found' })
  @ApiConflictResponse({ description: 'Cannot remove last owner' })
  async removeMember(
    @Param('id', ParseUUIDPipe) businessId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() currentUser: User,
    @Req() request: Request,
  ) {
    await this.businessesService.removeMember(
      businessId,
      userId,
      currentUser.id,
      getAuditRequestContext(request),
    );
    return { message: 'Member removed' };
  }
}
