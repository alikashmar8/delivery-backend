import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { RegionsService } from './regions.service';
import { ListRegionsQueryDto } from './dto/region-query.dto';
import { PaginationQueryDto, paginated } from '../../common/dto/pagination.dto';
import {
  PaginatedRegionResponseDto,
  toRegionResponse,
} from './dto/region-response.dto';

@ApiTags('Regions')
@Controller('regions')
export class RegionsController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  @ApiOperation({ summary: 'List regions by country (public)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of regions',
    type: PaginatedRegionResponseDto,
  })
  async list(@Query() query: ListRegionsQueryDto) {
    const items = await this.regions.findAll(query.countryCode, query);
    return paginated(items.map(toRegionResponse), query);
  }

  @Get(':id/children')
  @ApiOperation({ summary: 'List child regions (public)' })
  @ApiResponse({
    status: 200,
    description: 'Paginated list of child regions',
    type: PaginatedRegionResponseDto,
  })
  async children(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() page: PaginationQueryDto,
  ) {
    const items = await this.regions.findChildren(id, page);
    return paginated(items.map(toRegionResponse), page);
  }
}
