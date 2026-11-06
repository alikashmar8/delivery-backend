import { ApiProperty } from '@nestjs/swagger';
import { Region } from '../entities/region.entity';

export class RegionResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ enum: ['country', 'governorate', 'district', 'area'] })
  type!: string;
  @ApiProperty()
  code!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty({ format: 'uuid', nullable: true })
  parentId!: string | null;
  @ApiProperty({ minLength: 2, maxLength: 2, example: 'LB' })
  countryCode!: string;
}

export class PaginatedRegionResponseDto {
  @ApiProperty({ type: () => [RegionResponseDto] })
  items!: RegionResponseDto[];
  @ApiProperty({ example: 20 })
  take!: number;
  @ApiProperty({ example: 0 })
  skip!: number;
}

export function toRegionResponse(region: Region): RegionResponseDto {
  return {
    id: region.id,
    type: region.type,
    code: region.code,
    name: region.name,
    parentId: region.parentId,
    countryCode: region.countryCode,
  };
}
