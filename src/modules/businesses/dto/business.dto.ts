import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsPhoneNumber,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateBusinessDto {
  @ApiProperty({ example: 'Acme Delivery' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ example: 'acme-delivery', pattern: '^[a-z0-9-]+$' })
  @IsString()
  @Matches(/^[a-z0-9-]+$/, {
    message: 'slug must be lowercase alphanumeric with hyphens',
  })
  slug!: string;

  @ApiProperty({ example: '+96170123456' })
  @IsPhoneNumber()
  @IsString()
  contactPhone!: string;

  @ApiPropertyOptional({ example: 'Acme Delivery SAL' })
  @IsOptional()
  @IsString()
  legalName?: string;
}
