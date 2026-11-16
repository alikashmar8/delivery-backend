import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { setTimeout } from 'node:timers/promises';
import {
  CreateBucketCommand,
  PutBucketVersioningCommand,
  S3Client,
} from '@aws-sdk/client-s3';

const docker = promisify(execFile);
export async function createS3Storage() {
  const accessKeyId = 'd02-test-user';
  const secretAccessKey = randomBytes(24).toString('hex');
  let id: string;
  try {
    id = (
      await docker('docker', [
        'run',
        '--rm',
        '--detach',
        '--pull=never',
        '--publish',
        '127.0.0.1::9000',
        '--env',
        `MINIO_ROOT_USER=${accessKeyId}`,
        '--env',
        `MINIO_ROOT_PASSWORD=${secretAccessKey}`,
        'minio/minio',
        'server',
        '/data',
        '--address',
        ':9000',
      ])
    ).stdout.trim();
  } catch {
    throw new Error(
      'Isolated MinIO requires Docker and a local minio/minio image',
    );
  }
  let client: S3Client | undefined;
  const close = async () => {
    client?.destroy();
    await docker('docker', ['rm', '--force', id]);
  };
  try {
    const mapping = (await docker('docker', ['port', id, '9000/tcp'])).stdout;
    const port = /^127\.0\.0\.1:(\d+)\s*$/.exec(mapping)?.[1];
    if (!port) throw new Error('Storage must bind loopback');
    const endpoint = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if ((await fetch(endpoint + '/minio/health/live')).ok) {
          ready = true;
          break;
        }
      } catch {}
      await setTimeout(100);
    }
    if (!ready) throw new Error('Isolated storage did not start');
    client = new S3Client({
      region: 'us-east-1',
      endpoint,
      forcePathStyle: true,
      credentials: { accessKeyId, secretAccessKey },
    });
    const bucket = 'd02-photo-evidence';
    await client.send(new CreateBucketCommand({ Bucket: bucket }));
    await client.send(
      new PutBucketVersioningCommand({
        Bucket: bucket,
        VersioningConfiguration: { Status: 'Enabled' },
      }),
    );
    return { client, bucket, endpoint, accessKeyId, secretAccessKey, close };
  } catch (error) {
    await close();
    throw error;
  }
}
