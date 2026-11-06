import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ErrorPayloadDto {
  @ApiProperty({ example: 'BAD_REQUEST' })
  code!: string;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Optional structured validation or domain details',
    oneOf: [{ type: 'array' }, { type: 'object' }],
  })
  details?: unknown;

  @ApiProperty({ example: '6f43a1e2-9d7d-4b1b-a4b4-1b9b5d2e6f20' })
  requestId!: string;
}

export class ErrorResponseDto {
  @ApiProperty({ type: () => ErrorPayloadDto })
  error!: ErrorPayloadDto;
}
