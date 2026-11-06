import { registerAs } from '@nestjs/config';

export default registerAs('database', () => ({
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  name: process.env.DB_NAME ?? 'delivery_platform',
  user: process.env.DB_USER ?? 'delivery',
  password: process.env.DB_PASSWORD ?? 'delivery_secret',
}));
