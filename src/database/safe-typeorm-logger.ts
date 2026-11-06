import { Logger, QueryRunner } from 'typeorm';

/**
 * Logs SQL text and slow/error diagnostics but never query parameters, which can
 * carry password hashes, refresh-token hashes, OTP hashes or phone numbers (A04).
 */
export class SafeTypeOrmLogger implements Logger {
  logQuery(
    query: string,
    _parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ): void {
    console.log(`[typeorm:query] ${query}`);
  }

  logQueryError(
    error: string | Error,
    query: string,
    _parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ): void {
    const message = error instanceof Error ? error.message : error;
    console.error(`[typeorm:query-error] ${message} -- ${query}`);
  }

  logQuerySlow(
    time: number,
    query: string,
    _parameters?: unknown[],
    _queryRunner?: QueryRunner,
  ): void {
    console.warn(`[typeorm:slow-query] ${time}ms -- ${query}`);
  }

  logSchemaBuild(message: string, _queryRunner?: QueryRunner): void {
    console.log(`[typeorm:schema] ${message}`);
  }

  logMigration(message: string, _queryRunner?: QueryRunner): void {
    console.log(`[typeorm:migration] ${message}`);
  }

  log(
    level: 'log' | 'info' | 'warn',
    message: unknown,
    _queryRunner?: QueryRunner,
  ): void {
    if (level === 'warn') console.warn(`[typeorm] ${String(message)}`);
    else console.log(`[typeorm] ${String(message)}`);
  }
}
