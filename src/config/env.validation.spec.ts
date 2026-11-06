import { describe, expect, it } from 'vitest';
import { validateEnvironment } from './env.validation';

const REAL_ACCESS_SECRET = 'a'.repeat(20) + '-genuinely-random-access-1';
const REAL_REFRESH_SECRET = 'b'.repeat(20) + '-genuinely-random-refresh-1';

function baseProductionEnv(overrides: Record<string, string> = {}) {
  return {
    APP_ENV: 'production',
    DB_HOST: 'db.internal',
    DB_PORT: '5432',
    DB_NAME: 'delivery',
    DB_USER: 'delivery',
    DB_PASSWORD: 'a-real-managed-secret-value',
    JWT_ACCESS_SECRET: REAL_ACCESS_SECRET,
    JWT_REFRESH_SECRET: REAL_REFRESH_SECRET,
    ...overrides,
  };
}

describe('validateEnvironment', () => {
  it('accepts a well-formed production configuration', () => {
    expect(() => validateEnvironment(baseProductionEnv())).not.toThrow();
  });

  it('rejects the exact JWT placeholder secrets published in .env.example', () => {
    expect(() =>
      validateEnvironment(
        baseProductionEnv({
          JWT_ACCESS_SECRET: 'replace-with-at-least-32-random-characters',
        }),
      ),
    ).toThrow(/JWT_ACCESS_SECRET/);
    expect(() =>
      validateEnvironment(
        baseProductionEnv({
          JWT_REFRESH_SECRET: 'replace-with-a-different-32-character-secret',
        }),
      ),
    ).toThrow(/JWT_REFRESH_SECRET/);
  });

  it('rejects generic placeholder wording even if not exactly the published value', () => {
    expect(() =>
      validateEnvironment(
        baseProductionEnv({
          JWT_ACCESS_SECRET: 'change-me-please-use-something-else-1234',
        }),
      ),
    ).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects equal access and refresh secrets', () => {
    expect(() =>
      validateEnvironment(
        baseProductionEnv({ JWT_REFRESH_SECRET: REAL_ACCESS_SECRET }),
      ),
    ).toThrow(/must be different/);
  });

  it('rejects a missing required database field', () => {
    const env = baseProductionEnv();
    delete (env as Record<string, string | undefined>).DB_HOST;
    expect(() => validateEnvironment(env)).toThrow(/DB_HOST is required/);
  });

  it('rejects the published placeholder database password', () => {
    expect(() =>
      validateEnvironment(
        baseProductionEnv({ DB_PASSWORD: 'replace-with-a-local-password' }),
      ),
    ).toThrow(/DB_PASSWORD/);
  });

  it('allows the local Compose default password outside production requirements only when explicitly set', () => {
    // Local default is intentionally weak but must still not be a "replace/change" placeholder.
    expect(() =>
      validateEnvironment(baseProductionEnv({ DB_PASSWORD: 'postgres' })),
    ).not.toThrow();
  });

  it('skips database/secret requirements in the test environment', () => {
    expect(() => validateEnvironment({ APP_ENV: 'test' })).not.toThrow();
  });

  it('rejects an out-of-range port', () => {
    expect(() =>
      validateEnvironment(baseProductionEnv({ DB_PORT: '99999' })),
    ).toThrow(/DB_PORT/);
  });

  it('accepts a missing or valid OTP store selection', () => {
    expect(() => validateEnvironment(baseProductionEnv())).not.toThrow();
    expect(() =>
      validateEnvironment(baseProductionEnv({ OTP_STATE: 'redis' })),
    ).not.toThrow();
    expect(() =>
      validateEnvironment(baseProductionEnv({ OTP_STATE: 'memory' })),
    ).not.toThrow();
  });

  it('rejects an unknown OTP store selection', () => {
    expect(() =>
      validateEnvironment(baseProductionEnv({ OTP_STATE: 'postgres' })),
    ).toThrow(/OTP_STATE/);
  });

  it('accepts exact comma-separated CORS origins', () => {
    expect(() =>
      validateEnvironment(
        baseProductionEnv({
          APP_HOST: '0.0.0.0',
          CORS_ORIGINS: 'http://localhost:5173,https://console.example.com',
        }),
      ),
    ).not.toThrow();
  });

  it.each([
    '*',
    'localhost:5173',
    'https://console.example.com/path',
    'https://console.example.com/',
    'https://user:password@console.example.com',
    'http://localhost:5173,',
  ])('rejects unsafe or malformed CORS origin %s', (corsOrigins) => {
    expect(() =>
      validateEnvironment(baseProductionEnv({ CORS_ORIGINS: corsOrigins })),
    ).toThrow(/CORS_ORIGINS/);
  });
});
