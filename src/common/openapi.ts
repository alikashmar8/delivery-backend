import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import type { OpenAPIObject } from '@nestjs/swagger';
import { ErrorResponseDto } from './dto/error-response.dto';

const ERROR_RESPONSE_STATUSES = [
  '400',
  '401',
  '403',
  '404',
  '409',
  '422',
  '429',
  '500',
  '503',
] as const;

export function createOpenApiConfig() {
  const config = new DocumentBuilder()
    .setTitle('Delivery Platform API')
    .setDescription(
      'Last-mile delivery platform API for personal and business deliveries in Lebanon',
    )
    .setVersion('1.0')
    .setOpenAPIVersion('3.1.0')
    .addServer('/', 'Current deployment')
    .addSecurityRequirements({})
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter JWT access token',
      },
      'JWT',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'Idempotency-Key',
        in: 'header',
        description: 'Optional idempotency key for retryable operations',
      },
      'Idempotency-Key',
    )
    .addGlobalResponse({
      status: 400,
      description: 'Request validation failed',
      type: ErrorResponseDto,
    })
    .addGlobalResponse({
      status: 401,
      description: 'Authentication required or credentials invalid',
      type: ErrorResponseDto,
    })
    .addGlobalResponse({
      status: 403,
      description: 'Access denied',
      type: ErrorResponseDto,
    })
    .addGlobalResponse({
      status: 404,
      description: 'Resource not found',
      type: ErrorResponseDto,
    })
    .addGlobalResponse({
      status: 409,
      description: 'Conflict',
      type: ErrorResponseDto,
    })
    .addGlobalResponse({
      status: 429,
      description: 'Rate limit exceeded',
      type: ErrorResponseDto,
    })
    .addGlobalResponse({
      status: 500,
      description: 'Internal server error',
      type: ErrorResponseDto,
    })
    .build();

  config.info.license = {
    name: 'UNLICENSED',
    url: 'https://choosealicense.com/no-permission/',
  };
  return config;
}

export function createOpenApiDocument(app: INestApplication) {
  const document = SwaggerModule.createDocument(app, createOpenApiConfig(), {
    extraModels: [ErrorResponseDto],
  });

  return addErrorResponseSchemas(document);
}

function addErrorResponseSchemas(document: OpenAPIObject): OpenAPIObject {
  const methods = [
    'get',
    'put',
    'post',
    'delete',
    'options',
    'head',
    'patch',
    'trace',
  ] as const;

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation || path === '/health') continue;

      for (const status of ERROR_RESPONSE_STATUSES) {
        const response = operation.responses[status];
        if (!response || '$ref' in response || response.content) continue;

        response.content = {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponseDto' },
          },
        };
      }
    }
  }

  return document;
}
