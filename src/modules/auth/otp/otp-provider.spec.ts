import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryOtpProvider } from './otp-provider';

describe('MemoryOtpProvider contract', () => {
  afterEach(() => {
    delete process.env.APP_ENV;
    vi.restoreAllMocks();
  });

  it('records the normalized phone and six-digit code without logging', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    const provider = new MemoryOtpProvider();

    await provider.send('+96170000001', '482916');

    expect(provider.lastSentTo('+96170000001')).toMatchObject({
      phone: '+96170000001',
      code: '482916',
    });
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('supports one-shot failure injection for retry/failure coverage', async () => {
    const provider = new MemoryOtpProvider();
    provider.failNext('vendor circuit open');

    await expect(provider.send('+96170000002', '111111')).rejects.toThrow(
      'vendor circuit open',
    );

    // The injected failure fires once; delivery recovers afterwards.
    await provider.send('+96170000002', '222222');
    expect(provider.lastSentTo('+96170000002')?.code).toBe('222222');
  });

  it('fails closed in production without a real vendor', async () => {
    process.env.APP_ENV = 'production';
    const provider = new MemoryOtpProvider();
    await expect(provider.send('+96170000003', '333333')).rejects.toThrow(
      'OTP delivery unavailable',
    );
    expect(provider.lastSentTo('+96170000003')).toBeUndefined();
  });

  it('bounds the recording outbox', async () => {
    const provider = new MemoryOtpProvider(10);
    for (let i = 0; i < 25; i += 1) {
      await provider.send(`+9617${String(i).padStart(7, '0')}`, '123456');
    }
    expect(provider.sent).toHaveLength(10);
  });
});
