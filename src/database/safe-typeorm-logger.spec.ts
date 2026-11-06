import { describe, expect, it, vi } from 'vitest';
import { SafeTypeOrmLogger } from './safe-typeorm-logger';

describe('SafeTypeOrmLogger', () => {
  it('logs query text but never the parameters array', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const logger = new SafeTypeOrmLogger();

    logger.logQuery('SELECT * FROM refresh_tokens WHERE "tokenHash" = $1', [
      'super-secret-hash-value',
    ]);

    expect(log).toHaveBeenCalledTimes(1);
    const [message] = log.mock.calls[0] as [string];
    expect(message).toContain('SELECT * FROM refresh_tokens');
    expect(message).not.toContain('super-secret-hash-value');
    log.mockRestore();
  });

  it('logs query error text but never the parameters array', () => {
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const logger = new SafeTypeOrmLogger();

    logger.logQueryError(
      new Error('duplicate key value'),
      'INSERT INTO users (phone) VALUES ($1)',
      ['+96171000000-secret-otp-context'],
    );

    expect(error).toHaveBeenCalledTimes(1);
    const [message] = error.mock.calls[0] as [string];
    expect(message).toContain('duplicate key value');
    expect(message).not.toContain('secret-otp-context');
    error.mockRestore();
  });

  it('logs slow-query text but never the parameters array', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const logger = new SafeTypeOrmLogger();

    logger.logQuerySlow(1200, 'UPDATE users SET password_hash = $1', [
      'argon2-hash-should-not-leak',
    ]);

    expect(warn).toHaveBeenCalledTimes(1);
    const [message] = warn.mock.calls[0] as [string];
    expect(message).toContain('UPDATE users');
    expect(message).not.toContain('argon2-hash-should-not-leak');
    warn.mockRestore();
  });
});
