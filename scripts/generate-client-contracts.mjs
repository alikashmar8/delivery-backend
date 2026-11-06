import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(backendRoot, '..');
const generator = resolve(
  backendRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32'
    ? 'openapi-typescript.cmd'
    : 'openapi-typescript',
);
const specPath = resolve(backendRoot, 'openapi.json');

const destinations = [
  'admin-web/src/api/openapi.d.ts',
  'customer-web/src/api/openapi.d.ts',
  'delivery-mobile/src/api/openapi.d.ts',
];

for (const relativeDestination of destinations) {
  const destination = resolve(workspaceRoot, relativeDestination);
  mkdirSync(dirname(destination), { recursive: true });
  execFileSync(generator, [specPath, '-o', destination], {
    cwd: backendRoot,
    stdio: 'inherit',
  });
}
