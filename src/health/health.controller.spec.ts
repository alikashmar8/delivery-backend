import { Test } from '@nestjs/testing';
import { TerminusModule } from '@nestjs/terminus';
import { getDataSourceToken } from '@nestjs/typeorm';
import { describe, it, expect, vi } from 'vitest';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  async function setup(query: ReturnType<typeof vi.fn>) {
    const module = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [{ provide: getDataSourceToken(), useValue: { query } }],
    }).compile();
    return { module, controller: module.get(HealthController) };
  }

  it('reports up after executing the database ping', async () => {
    const query = vi.fn().mockResolvedValue([{ '?column?': 1 }]);
    const { module, controller } = await setup(query);
    try {
      expect(await controller.check()).toMatchObject({
        status: 'ok',
        info: { database: { status: 'up' } },
      });
      expect(query).toHaveBeenCalledWith('SELECT 1');
    } finally {
      await module.close();
    }
  });

  it('reports 503 without exposing private connection errors when the ping fails', async () => {
    const query = vi
      .fn()
      .mockRejectedValue(new Error('private connection details'));
    const { module, controller } = await setup(query);
    try {
      await expect(controller.check()).rejects.toMatchObject({
        status: 503,
        response: {
          status: 'error',
          error: {
            database: { status: 'down', message: 'Database ping failed' },
          },
        },
      });
    } finally {
      await module.close();
    }
  });
});
