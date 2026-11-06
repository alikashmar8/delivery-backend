import { hash, verify } from 'argon2';
import dataSource from '../database/data-source';
import { User, UserStatus } from '../modules/users/entities/user.entity';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function seedSmokeUser(): Promise<void> {
  if (process.env.APP_ENV === 'production') {
    throw new Error('Smoke users cannot be seeded in production');
  }

  const email = required('SMOKE_EMAIL').toLowerCase();
  const phone = required('SMOKE_PHONE');
  const password = required('SMOKE_PASSWORD');
  const displayName =
    process.env.SMOKE_DISPLAY_NAME?.trim() || 'API Smoke User';

  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('SMOKE_EMAIL is invalid');
  if (!/^\+[1-9]\d{7,14}$/.test(phone)) {
    throw new Error('SMOKE_PHONE must be an E.164 phone number');
  }
  if (password.length < 8) {
    throw new Error('SMOKE_PASSWORD must contain at least 8 characters');
  }

  await dataSource.initialize();
  try {
    const userRepository = dataSource.getRepository(User);
    const existing = await userRepository.findOne({
      where: [{ email }, { phone }],
      withDeleted: true,
    });
    if (existing) {
      const matchesRequestedUser =
        existing.email === email &&
        existing.phone === phone &&
        existing.status === UserStatus.ACTIVE &&
        existing.deletedAt === null &&
        existing.passwordHash &&
        (await verify(existing.passwordHash, password));
      if (matchesRequestedUser) {
        process.stdout.write(`Smoke user ${email} is already ready\n`);
        return;
      }
      throw new Error(
        'SMOKE_EMAIL or SMOKE_PHONE belongs to a different existing user',
      );
    }

    await userRepository.save(
      userRepository.create({
        email,
        phone,
        displayName,
        passwordHash: await hash(password),
        status: UserStatus.ACTIVE,
      }),
    );
    process.stdout.write(`Created non-production smoke user ${email}\n`);
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

void seedSmokeUser().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown error';
  process.stderr.write(`Could not seed smoke user: ${message}\n`);
  process.exitCode = 1;
});
