import { ApiProperty } from '@nestjs/swagger';
import { BusinessMember } from '../entities/business-member.entity';
import { Business } from '../entities/business.entity';

export class BusinessResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty()
  name!: string;
  @ApiProperty()
  slug!: string;
  @ApiProperty({ enum: ['active', 'suspended'] })
  status!: string;
  @ApiProperty({ example: 'LB' })
  country!: string;
  @ApiProperty({ example: 'USD' })
  currency!: string;
  @ApiProperty()
  contactPhone!: string;
  @ApiProperty({ type: String, nullable: true })
  legalName!: string | null;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class BusinessMemberResponseDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;
  @ApiProperty({ format: 'uuid' })
  businessId!: string;
  @ApiProperty({ format: 'uuid' })
  userId!: string;
  @ApiProperty({ enum: ['owner', 'manager', 'operator', 'accountant'] })
  role!: string;
  @ApiProperty({ enum: ['active', 'suspended'] })
  status!: string;
  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;
}

export class PaginatedBusinessResponseDto {
  @ApiProperty({ type: () => [BusinessResponseDto] })
  items!: BusinessResponseDto[];
  @ApiProperty({ example: 20 })
  take!: number;
  @ApiProperty({ example: 0 })
  skip!: number;
}

export class PaginatedBusinessMemberResponseDto {
  @ApiProperty({ type: () => [BusinessMemberResponseDto] })
  items!: BusinessMemberResponseDto[];
  @ApiProperty({ example: 20 })
  take!: number;
  @ApiProperty({ example: 0 })
  skip!: number;
}

export function toBusinessResponse(business: Business): BusinessResponseDto {
  return {
    id: business.id,
    name: business.name,
    slug: business.slug,
    status: business.status,
    country: business.country,
    currency: business.currency,
    contactPhone: business.contactPhone,
    legalName: business.legalName,
    createdAt: business.createdAt,
  };
}

export function toBusinessMemberResponse(
  member: BusinessMember,
): BusinessMemberResponseDto {
  return {
    id: member.id,
    businessId: member.businessId,
    userId: member.userId,
    role: member.role,
    status: member.status,
    createdAt: member.createdAt,
  };
}
