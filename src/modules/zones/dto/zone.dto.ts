import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { IsGeoJsonPolygon } from './geojson.validator';

export class CreateZoneDto {
  @ApiProperty({ example: 'Beirut Central', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  businessId?: string;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    description: 'GeoJSON Polygon geometry and coordinates',
  })
  @IsObject()
  @IsGeoJsonPolygon()
  boundary!: Record<string, unknown>;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateZoneDto {
  @ApiPropertyOptional({ example: 'Beirut Central', maxLength: 255 })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    description: 'GeoJSON Polygon geometry and coordinates',
  })
  @IsOptional()
  @IsObject()
  @IsGeoJsonPolygon()
  boundary?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
