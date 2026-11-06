import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import Redis from 'ioredis';

const docker = promisify(execFile);

/**
 * Owns a fresh ephemeral Redis container; never touches application Redis
 * environment settings. Mirrors the isolated PostGIS helper convention:
 * loopback-only port, no volume, container removed on close.
 */
export async function createEphemeralRedis(): Promise<{
  client: Redis;
  close: () => Promise<void>;
}> {
  const args = [
    'run',
    '--detach',
    '--rm',
    '--pull=never',
    '--publish',
    '127.0.0.1::6379',
    'redis:7-alpine',
  ];
  let containerId: string;
  try {
    const { stdout } = await docker('docker', args, { timeout: 15_000 });
    containerId = stdout.trim();
  } catch {
    throw new Error(
      'Cannot start isolated Redis: Docker and the local redis:7-alpine image are required',
    );
  }

  let client: Redis | undefined;
  async function close(): Promise<void> {
    try {
      if (client) client.disconnect();
    } finally {
      await docker('docker', ['rm', '--force', containerId], {
        timeout: 10_000,
      });
    }
  }

  try {
    const port = await docker('docker', ['port', containerId, '6379/tcp'], {
      timeout: 5_000,
    });
    const match = /^127\.0\.0\.1:(\d+)\s*$/.exec(port.stdout);
    if (!match) throw new Error('Test Redis was not bound to loopback');

    client = new Redis({
      host: '127.0.0.1',
      port: Number(match[1]),
      lazyConnect: true,
      maxRetriesPerRequest: 3,
    });
    client.on('error', () => undefined);
    const deadline = Date.now() + 15_000;
    for (;;) {
      try {
        await client.ping();
        break;
      } catch {
        if (Date.now() > deadline) {
          throw new Error('Isolated Redis did not start');
        }
        await setTimeout(200);
      }
    }
    return { client, close };
  } catch (error) {
    await close();
    throw error;
  }
}
