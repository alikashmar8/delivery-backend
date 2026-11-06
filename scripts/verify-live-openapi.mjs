import { execFileSync } from 'node:child_process';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const backendRoot = resolve(new URL('..', import.meta.url).pathname);
const baseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(
  /\/$/,
  '',
);
const expected = JSON.parse(
  readFileSync(resolve(backendRoot, 'openapi.json'), 'utf8'),
);

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(`${path} returned HTTP ${response.status}`);
  }
  return payload;
}

const liveDocument = await getJson('/docs-json');
if (liveDocument.openapi !== expected.openapi) {
  throw new Error(
    `Live OpenAPI version ${liveDocument.openapi} differs from generated ${expected.openapi}`,
  );
}

for (const path of [
  '/health',
  '/auth/login/password',
  '/users/me',
  '/deliveries',
  '/deliveries/{id}/details',
]) {
  if (!liveDocument.paths?.[path]) {
    throw new Error(`Live OpenAPI document is missing ${path}`);
  }
}

for (const schema of [
  'ErrorResponseDto',
  'TokenResponseDto',
  'DeliveryResponseDto',
]) {
  if (!liveDocument.components?.schemas?.[schema]) {
    throw new Error(`Live OpenAPI document is missing ${schema}`);
  }
}

const health = await getJson('/health');
if (health.status !== 'ok' || health.details?.database?.status !== 'up') {
  throw new Error(
    'Live health response did not report an operational database',
  );
}

const temporarySpec = join(
  tmpdir(),
  `delivery-platform-openapi-${process.pid}.json`,
);
writeFileSync(temporarySpec, JSON.stringify(liveDocument, null, 2));
try {
  execFileSync(
    resolve(
      backendRoot,
      'node_modules',
      '.bin',
      process.platform === 'win32' ? 'redocly.cmd' : 'redocly',
    ),
    ['lint', temporarySpec],
    { stdio: 'inherit' },
  );
} finally {
  unlinkSync(temporarySpec);
}

console.log('Live OpenAPI document and health contract verified');
