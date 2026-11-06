const PLACEHOLDER_SECRETS = new Set([
  'change-me-in-production',
  'change-me-refresh-in-production',
  'secret',
  'changeme',
  // Exact values published in the repository's .env.example (A05): long and
  // distinct from each other, so length/equality checks alone accept them.
  'replace-with-at-least-32-random-characters',
  'replace-with-a-different-32-character-secret',
]);

// Catches published/example placeholder wording even if the exact string changes.
const PLACEHOLDER_SECRET_PATTERN =
  /replace[-_ ]?with|change[-_ ]?me|your[-_ ]?secret|placeholder|example|sample/i;

function isPlaceholderValue(value: string): boolean {
  return (
    PLACEHOLDER_SECRETS.has(value.toLowerCase()) ||
    PLACEHOLDER_SECRET_PATTERN.test(value)
  );
}

function requirePort(name: string, value: string | undefined): void {
  if (value === undefined) return;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${name} must be an integer between 1 and 65535`);
  }
}

function requireSecret(name: string, value: string | undefined): void {
  if (!value || value.length < 32 || isPlaceholderValue(value)) {
    throw new Error(
      `${name} must be set to a non-placeholder value of at least 32 characters`,
    );
  }
}

function requireNonPlaceholder(name: string, value: string | undefined): void {
  if (!value?.trim() || isPlaceholderValue(value)) {
    throw new Error(`${name} must be set to a non-placeholder value`);
  }
}

function requireCorsOrigins(value: string | undefined): void {
  if (value === undefined) return;

  const origins = value.split(',').map((origin) => origin.trim());
  if (origins.length === 0 || origins.some((origin) => !origin)) {
    throw new Error('CORS_ORIGINS must be a comma-separated list of origins');
  }

  for (const origin of origins) {
    if (origin === '*') {
      throw new Error('CORS_ORIGINS must not contain a wildcard');
    }

    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }

    if (
      !['http:', 'https:'].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error(
        `CORS_ORIGINS entries must be exact http(s) origins: ${origin}`,
      );
    }
  }
}

export function validateEnvironment(
  environment: Record<string, unknown>,
): Record<string, unknown> {
  const env = environment as Record<string, string | undefined>;
  const appEnv = env.APP_ENV ?? 'development';
  if (!['development', 'test', 'production'].includes(appEnv)) {
    throw new Error('APP_ENV must be development, test, or production');
  }

  requirePort('APP_PORT', env.APP_PORT);
  requirePort('DB_PORT', env.DB_PORT);
  requirePort('REDIS_PORT', env.REDIS_PORT);

  if (env.APP_HOST !== undefined && !env.APP_HOST.trim()) {
    throw new Error('APP_HOST must not be empty');
  }
  requireCorsOrigins(env.CORS_ORIGINS);

  if (appEnv !== 'test') {
    for (const name of ['DB_HOST', 'DB_NAME', 'DB_USER']) {
      if (!env[name]?.trim()) throw new Error(`${name} is required`);
    }
    requireNonPlaceholder('DB_PASSWORD', env.DB_PASSWORD);
    requireSecret('JWT_ACCESS_SECRET', env.JWT_ACCESS_SECRET);
    requireSecret('JWT_REFRESH_SECRET', env.JWT_REFRESH_SECRET);
    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      throw new Error('JWT access and refresh secrets must be different');
    }
  }

  for (const name of ['JWT_ACCESS_EXPIRATION', 'JWT_REFRESH_EXPIRATION']) {
    if (env[name] && !/^\d+[mhd]$/.test(env[name])) {
      throw new Error(
        `${name} must use an m, h, or d duration (for example 15m)`,
      );
    }
  }

  if (env.OTP_STATE && !['memory', 'redis'].includes(env.OTP_STATE)) {
    throw new Error("OTP_STATE must be 'memory' or 'redis'");
  }

  return environment;
}
