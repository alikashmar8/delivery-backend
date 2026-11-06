import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { createOpenApiDocument } from './common/openapi';
import { appValidationPipe } from './common/pipes/validation.pipe';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const logger = app.get(Logger);

  app.useLogger(logger);
  app.use(helmet());
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalPipes(appValidationPipe);
  app.enableShutdownHooks();

  const port = config.get<number>('app.port') ?? 3000;
  const host = config.get<string>('app.host') ?? '127.0.0.1';
  const corsOrigins = config.get<string[]>('app.corsOrigins') ?? [];
  if (corsOrigins.length > 0) {
    app.enableCors({
      origin: corsOrigins,
      credentials: false,
      methods: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Authorization',
        'Content-Type',
        'Idempotency-Key',
        'X-Request-ID',
      ],
      exposedHeaders: ['X-Request-ID'],
      maxAge: 86_400,
    });
  }

  const document = createOpenApiDocument(app);
  SwaggerModule.setup('docs', app, document, {
    customSiteTitle: 'Delivery Platform API',
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      filter: true,
      tagsSorter: 'alpha',
    },
  });

  await app.listen(port, host);
  logger.log(`Application listening on ${host}:${port}`);
  logger.log(`API documentation available at http://${host}:${port}/docs`);
}

bootstrap();
