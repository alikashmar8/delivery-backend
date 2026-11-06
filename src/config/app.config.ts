import { registerAs } from '@nestjs/config';

function commaSeparatedValues(value: string | undefined): string[] {
  return value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
}

export default registerAs('app', () => ({
  port: Number(process.env.APP_PORT ?? 3000),
  host: process.env.APP_HOST?.trim() || '127.0.0.1',
  env: process.env.APP_ENV ?? 'development',
  corsOrigins: commaSeparatedValues(process.env.CORS_ORIGINS),
}));
