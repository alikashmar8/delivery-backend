/**
 * Generate OpenAPI specification from NestJS application
 * Run with: node scripts/generate-openapi.mjs
 */
import { NestFactory } from '@nestjs/core';
import { writeFileSync } from 'fs';
import { AppModule } from '../dist/app.module.js';
import { createOpenApiDocument } from '../dist/common/openapi.js';

async function generateOpenApi() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
  });

  const document = createOpenApiDocument(app);

  writeFileSync('./openapi.json', JSON.stringify(document, null, 2));
  console.log('OpenAPI specification generated: openapi.json');

  await app.close();
  process.exit(0);
}

generateOpenApi().catch((err) => {
  console.error('Failed to generate OpenAPI spec:', err);
  process.exit(1);
});
