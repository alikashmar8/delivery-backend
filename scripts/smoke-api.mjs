const baseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);
const email = process.env.SMOKE_EMAIL?.trim().toLowerCase();
const password = process.env.SMOKE_PASSWORD;

if (!email || !password) {
  throw new Error('SMOKE_EMAIL and SMOKE_PASSWORD are required');
}

async function expectStatus(path, expectedStatus, init) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    signal: AbortSignal.timeout(5_000),
  });
  if (response.status !== expectedStatus) {
    throw new Error(`${path} returned ${response.status}; expected ${expectedStatus}`);
  }
  return response;
}

await expectStatus('/health', 200);
await expectStatus('/users/me', 401);

const login = await expectStatus('/auth/login/password', 200, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const tokens = await login.json();
if (typeof tokens.accessToken !== 'string' || !tokens.accessToken) {
  throw new Error('Password login did not return an access token');
}

const profile = await expectStatus('/users/me', 200, {
  headers: { Authorization: `Bearer ${tokens.accessToken}` },
});
const user = await profile.json();
if (user.email !== email || 'passwordHash' in user) {
  throw new Error('Authenticated profile response did not match the smoke user');
}

process.stdout.write(
  'API smoke passed: health 200, protected route 401, login 200, bearer profile 200\n',
);
