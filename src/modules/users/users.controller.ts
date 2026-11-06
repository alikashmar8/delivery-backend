import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
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
import { RBACGuard, RequiredRoles } from '../auth/guards/rbac.guard';
import { AdminRole } from './entities/admin-role-assignment.entity';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UserSummaryResponseDto } from './dto/user-response.dto';
import { UpdateAdminRolesDto } from './dto/admin-role.dto';
import {
  AdminRolesResponseDto,
  toAdminRolesResponse,
} from './dto/admin-role-response.dto';
import { getAuditRequestContext } from '../audit/audit-request-context';

@ApiTags('Users')
@ApiBearerAuth('JWT')
@Controller('users')
@UseGuards(AuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get my user profile' })
  @ApiResponse({
    status: 200,
    description: 'User profile',
    type: UserSummaryResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async getMe(@CurrentUser() user: User) {
    return await this.usersService.findUserSummary(user.id);
  }

  @Get(':id')
  @UseGuards(RBACGuard)
  @RequiredRoles(AdminRole.SUPER_ADMIN, AdminRole.ADMIN, AdminRole.SUPPORT)
  @ApiOperation({ summary: 'Admin: Get user by ID' })
  @ApiResponse({
    status: 200,
    description: 'User profile',
    type: UserSummaryResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Admin role required' })
  @ApiNotFoundResponse({ description: 'User not found' })
  async getUser(@Param('id', ParseUUIDPipe) id: string) {
    return await this.usersService.findUserSummary(id);
  }

  @Post(':userId/admin-roles')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RBACGuard)
  @RequiredRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Set a user's complete platform-admin role set",
    description:
      'Reconciles the desired active roles. An empty roles array revokes all roles. Only active super admins may manage roles.',
  })
  @ApiResponse({
    status: 200,
    description: 'Platform roles reconciled successfully',
    type: AdminRolesResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Active super-admin role required' })
  @ApiNotFoundResponse({ description: 'Target user not found' })
  @ApiConflictResponse({
    description: 'The final active super-admin cannot be revoked',
  })
  async updateAdminRoles(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateAdminRolesDto,
    @CurrentUser() actor: User,
    @Req() request: Request,
  ) {
    const result = await this.usersService.updateAdminRoles(
      actor.id,
      userId,
      dto.roles,
      getAuditRequestContext(request),
    );
    return toAdminRolesResponse(userId, result.assignments, result.changed);
  }
}
