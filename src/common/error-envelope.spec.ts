import { BadRequestException, HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';

/**
 * S03: Error envelope consistency tests
 * Addresses A14 - ensure validation error messages are always strings
 */

describe('S03 error envelope — A14 message normalization', () => {
  function captureResponse(
    exception: unknown,
    incomingRequestId?: string,
  ) {
    const filter = new AllExceptionsFilter();
    let capturedStatus: number | undefined;
    let capturedBody: unknown;
    const capturedHeaders: Record<string, string> = {};

    const mockResponse = {
      status: (code: number) => {
        capturedStatus = code;
        return mockResponse;
      },
      json: (body: unknown) => {
        capturedBody = body;
        return mockResponse;
      },
      set: (header: string, value: string) => {
        capturedHeaders[header] = value;
        return mockResponse;
      },
    };

    const mockRequest = {
      get: (header: string) =>
        header.toLowerCase() === 'x-request-id'
          ? incomingRequestId
          : undefined,
      method: 'GET',
      path: '/test',
      ip: '127.0.0.1',
    };

    const host = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any;

    filter.catch(exception, host);

    return { status: capturedStatus!, body: capturedBody, capturedHeaders };
  }

  it('normalizes array validation messages to a single string', () => {
    // ValidationPipe returns messages as string[] for multiple validation errors
    const exception = new BadRequestException({
      message: [
        'recipient.name must be a string',
        'recipient.latitude must not be less than -90',
        'pickupAddress is required',
      ],
      error: 'Bad Request',
    });

    const { status, body } = captureResponse(exception, 'test-req-123');

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: expect.any(String),
        requestId: 'test-req-123',
      },
    });

    const errorBody = body as any;
    // Message should be a single string, not an array
    expect(typeof errorBody.error.message).toBe('string');
    expect(errorBody.error.message).toContain('recipient.name must be a string');
    expect(errorBody.error.message).toContain('recipient.latitude');
    expect(errorBody.error.message).toContain('pickupAddress is required');

    // Details should preserve the array for programmatic access
    expect(Array.isArray(errorBody.error.details)).toBe(true);
    expect(errorBody.error.details).toHaveLength(3);
  });

  it('handles single string message normally', () => {
    const exception = new BadRequestException('Invalid delivery status');

    const { status, body } = captureResponse(exception, 'test-req-123');

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: 'Invalid delivery status',
        requestId: 'test-req-123',
      },
    });

    const errorBody = body as any;
    expect(typeof errorBody.error.message).toBe('string');
    expect(errorBody.error.details).toBeUndefined();
  });

  it('handles object with string message', () => {
    const exception = new BadRequestException({
      message: 'Business slug already taken',
      error: 'Conflict',
      details: { slug: 'acme-corp' },
    });

    const { status, body } = captureResponse(exception, 'test-req-123');

    expect(status).toBe(HttpStatus.BAD_REQUEST);
    expect(body).toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: 'Business slug already taken',
        details: { slug: 'acme-corp' },
        requestId: 'test-req-123',
      },
    });

    const errorBody = body as any;
    expect(typeof errorBody.error.message).toBe('string');
  });

  it('assigns a correlation ID and hides internals for non-HTTP exceptions', () => {
    const exception = new Error('Unexpected database connection failure');
    const { status, body, capturedHeaders } = captureResponse(exception);

    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);

    const errorBody = body as any;
    // Message must stay opaque; the correlation ID is the only diagnostic.
    expect(errorBody.error.code).toBe('INTERNAL_ERROR');
    expect(errorBody.error.message).toBe('Internal server error');
    expect(typeof errorBody.error.requestId).toBe('string');
    expect(errorBody.error.requestId).toHaveLength(36);
    // The same correlation ID is exposed as a response header.
    expect(capturedHeaders['X-Request-ID']).toBe(
      errorBody.error.requestId,
    );
  });

  it('propagates the incoming X-Request-ID as the correlation ID', () => {
    const exception = new Error('boom');
    const { body, capturedHeaders } = captureResponse(
      exception,
      'incoming-id-1',
    );

    expect((body as any).error.requestId).toBe('incoming-id-1');
    expect(capturedHeaders['X-Request-ID']).toBe('incoming-id-1');
  });

  it('provides stable error codes for common statuses', () => {
    const { HttpException } = require('@nestjs/common');
    
    const cases = [
      { status: 400, code: 'BAD_REQUEST' },
      { status: 401, code: 'UNAUTHORIZED' },
      { status: 403, code: 'FORBIDDEN' },
      { status: 404, code: 'NOT_FOUND' },
      { status: 409, code: 'CONFLICT' },
      { status: 422, code: 'UNPROCESSABLE_ENTITY' },
      { status: 500, code: 'INTERNAL_ERROR' },
    ];

    for (const { status, code } of cases) {
      const exception = new HttpException('Test', status);
      const result = captureResponse(exception);
      expect((result.body as any).error.code).toBe(code);
    }
  });
});
