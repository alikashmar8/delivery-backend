import { ValidationPipe as NestValidationPipe } from '@nestjs/common';

/**
 * Global validation pipe with strict runtime validation.
 * 
 * Security & correctness notes:
 * - enableImplicitConversion is DISABLED: the string "false" must not become boolean true
 * - whitelist + forbidNonWhitelisted reject unknown fields
 * - transform enables @Type decorators for nested objects
 * - Explicit @Type() decorators are required for nested DTOs
 * - Boolean/number fields require explicit values, not string coercion
 */
export const appValidationPipe = new NestValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: {
    enableImplicitConversion: false, // CRITICAL: prevent misleading string→boolean conversion
  },
  // Return detailed validation errors for debugging
  // The global exception filter will normalize these for client responses
  disableErrorMessages: false,
});
