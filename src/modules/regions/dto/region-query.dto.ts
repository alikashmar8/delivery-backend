import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { PaginationQueryDto } from '../../../common/dto/pagination.dto';

export class ListRegionsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    default: 'LB',
    minLength: 2,
    maxLength: 2,
    example: 'LB',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  countryCode: string = 'LB';
}
