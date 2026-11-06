import { registerAs } from '@nestjs/config';

export default registerAs('jwt', () => ({
  accessSecret:
    process.env.JWT_ACCESS_SECRET ??
    (process.env.APP_ENV === 'test'
      ? 'test-access-secret-at-least-32-characters'
      : ''),
  accessExpiration: process.env.JWT_ACCESS_EXPIRATION ?? '15m',
  refreshSecret:
    process.env.JWT_REFRESH_SECRET ??
    (process.env.APP_ENV === 'test'
      ? 'test-refresh-secret-at-least-32-characters'
      : ''),
  refreshExpiration: process.env.JWT_REFRESH_EXPIRATION ?? '14d',
}));
