import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Global exception filter with correlation ID logging.
 *
 * Addresses A14: normalizes all exceptions into a consistent error envelope
 * with correlation IDs for tracing unexpected failures.
 *
 * Correlation ID flow:
 * 1. Extract X-Request-ID from incoming request, or generate UUID
 * 2. Attach to response header
 * 3. Include in error response body for client correlation
 * 4. Log with correlation ID for server-side tracing
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Generate or extract correlation ID
    const correlationId =
      (request.get('x-request-id') as string) || randomUUID();

    // Attach correlation ID to response header
    response.set('X-Request-ID', correlationId);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const obj = exResponse as Record<string, unknown>;

        // Normalize message: ValidationPipe can return string[] for validation errors
        const rawMessage = obj.message;
        if (Array.isArray(rawMessage)) {
          message = rawMessage.join('; ');
          details = rawMessage;
        } else if (typeof rawMessage === 'string') {
          message = rawMessage;
        }

        code = (obj.error as string) ?? code;

        if (details === undefined) {
          details = obj.details;
        }
      }

      code = this.getStatusCode(status);
    } else {
      // Unexpected non-HTTP exception: log with full context
      const errorMessage =
        exception instanceof Error ? exception.message : String(exception);
      const errorStack =
        exception instanceof Error ? exception.stack : undefined;

      this.logger.error(
        `Unexpected exception: ${errorMessage}`,
        errorStack,
        {
          correlationId,
          method: request.method,
          path: request.path,
          ip: request.ip,
        },
      );
    }

    response.status(status).json({
      error: {
        code,
        message,
        details,
        requestId: correlationId,
      },
    });
  }

  private getStatusCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'RATE_LIMITED',
      500: 'INTERNAL_ERROR',
    };
    return map[status] ?? 'ERROR';
  }
}