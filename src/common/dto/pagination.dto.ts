import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export class PaginationQueryDto {
  @ApiPropertyOptional({
    default: DEFAULT_PAGE_SIZE,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    description: 'Maximum number of records to return',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  take: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({
    default: 0,
    minimum: 0,
    description: 'Number of records to skip',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip: number = 0;
}

export interface PaginatedResponse<T> {
  items: T[];
  take: number;
  skip: number;
}

export function paginated<T>(
  items: T[],
  pagination: Pick<PaginationQueryDto, 'take' | 'skip'>,
): PaginatedResponse<T> {
  return { items, take: pagination.take, skip: pagination.skip };
}
