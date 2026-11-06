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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AuthGuard } from '../auth/guards/auth.guard';
import { User } from '../users/entities/user.entity';
import { AddressesService } from './addresses.service';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';
import { PaginationQueryDto, paginated } from '../../common/dto/pagination.dto';
import {
  AddressResponseDto,
  PaginatedAddressResponseDto,
  toAddressResponse,
} from './dto/address-response.dto';
import { MessageResponseDto } from '../../common/dto/response.dto';

@ApiTags('Addresses')
@ApiBearerAuth('JWT')
@Controller('addresses')
@UseGuards(AuthGuard)
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Post()
  @ApiOperation({ summary: 'Create new saved address' })
  @ApiResponse({
    status: 201,
    description: 'Address created successfully',
    type: AddressResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async create(@CurrentUser() user: User, @Body() dto: CreateAddressDto) {
    return toAddressResponse(await this.addresses.create(user.id, dto));
  }

  @Get()
  @ApiOperation({ summary: 'List my saved addresses' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of addresses',
    type: PaginatedAddressResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  async list(@CurrentUser() user: User, @Query() page: PaginationQueryDto) {
    const items = await this.addresses.findMine(user.id, page);
    return paginated(items.map(toAddressResponse), page);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get address by ID' })
  @ApiResponse({
    status: 200,
    description: 'Address found',
    type: AddressResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not your address' })
  @ApiNotFoundResponse({ description: 'Address not found' })
  async getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    return toAddressResponse(await this.addresses.findOne(id, user.id));
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update address' })
  @ApiResponse({
    status: 200,
    description: 'Address updated successfully',
    type: AddressResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not your address' })
  @ApiNotFoundResponse({ description: 'Address not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateAddressDto,
  ) {
    return toAddressResponse(await this.addresses.update(id, user.id, dto));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete address' })
  @ApiResponse({
    status: 200,
    description: 'Address deleted successfully',
    type: MessageResponseDto,
  })
  @ApiUnauthorizedResponse({ description: 'Authentication required' })
  @ApiForbiddenResponse({ description: 'Not your address' })
  @ApiNotFoundResponse({ description: 'Address not found' })
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: User,
  ) {
    await this.addresses.remove(id, user.id);
    return { message: 'Address deleted' };
  }
}
