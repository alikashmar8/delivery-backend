import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { setTimeout } from 'node:timers/promises';
import { DataSource, DataSourceOptions } from 'typeorm';

const docker = promisify(execFile);

export interface PostgisConnectionOptions {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

/** Always owns a fresh container; never reads application DB environment settings. */
export async function createPostgisDatabase(
  entities: NonNullable<DataSourceOptions['entities']>,
  migrations: NonNullable<DataSourceOptions['migrations']>,
  overrides?: Pick<DataSourceOptions, 'logging' | 'logger'>,
): Promise<{
  dataSource: DataSource;
  connection: PostgisConnectionOptions;
  close: () => Promise<void>;
}> {
  const password = randomBytes(24).toString('hex');
  const args = [
    'run',
    '--detach',
    '--rm',
    '--pull=never',
    '--publish',
    '127.0.0.1::5432',
    '--tmpfs',
    '/var/lib/postgresql/data',
    '--env',
    'POSTGRES_DB=delivery_f01_test',
    '--env',
    'POSTGRES_USER=delivery_test',
    '--env',
    `POSTGRES_PASSWORD=${password}`,
    'postgis/postgis:16-3.4',
  ];
  let containerId: string;
  try {
    const { stdout } = await docker('docker', args, { timeout: 15_000 });
    containerId = stdout.trim();
  } catch {
    // execFile errors include argv; do not print the generated DB password.
    throw new Error(
      'Cannot start isolated test database: Docker and the local postgis/postgis:16-3.4 image are required',
    );
  }
  let dataSource: DataSource | undefined;

  async function close(): Promise<void> {
    try {
      if (dataSource?.isInitialized) await dataSource.destroy();
    } finally {
      await docker('docker', ['rm', '--force', containerId], {
        timeout: 10_000,
      });
    }
  }

  try {
    const port = await docker('docker', ['port', containerId, '5432/tcp'], {
      timeout: 5_000,
    });
    const match = /^127\.0\.0\.1:(\d+)\s*$/.exec(port.stdout);
    if (!match) throw new Error('Test database was not bound to loopback');

    // The image initializes PostGIS before starting the final TCP-serving server.
    let ready = false;
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      try {
        await docker(
          'docker',
          [
            'exec',
            containerId,
            'pg_isready',
            '-h',
            '127.0.0.1',
            '-U',
            'delivery_test',
            '-d',
            'delivery_f01_test',
          ],
          { timeout: 5_000 },
        );
        ready = true;
        break;
      } catch {
        await setTimeout(250);
      }
    }
    if (!ready) throw new Error('Isolated PostGIS test database did not start');

    dataSource = new DataSource({
      type: 'postgres',
      host: '127.0.0.1',
      port: Number(match[1]),
      username: 'delivery_test',
      password,
      database: 'delivery_f01_test',
      entities,
      migrations,
      synchronize: false,
      logging: overrides?.logging ?? false,
      logger: overrides?.logger,
    });
    await dataSource.initialize();
    await dataSource.runMigrations();
    const connection: PostgisConnectionOptions = {
      host: '127.0.0.1',
      port: Number(match[1]),
      username: 'delivery_test',
      password,
      database: 'delivery_f01_test',
    };
    return { dataSource, connection, close };
  } catch (error) {
    await close();
    throw error;
  }
}
