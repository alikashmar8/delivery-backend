import { ServiceUnavailableException } from '@nestjs/common';

/** DI token for the SMS/OTP delivery provider. */
export const OTP_PROVIDER = 'OTP_PROVIDER';

/**
 * Boundary where a real SMS/OTP vendor plugs in. Implementations dispatch
 * the one-time code out of band (SMS/WhatsApp/voice) and must never write
 * the code or the full phone number to application logs. `send` resolves
 * only after the provider accepted the message; it rejects when delivery
 * was not attempted so callers fail closed instead of reporting "sent".
 */
export interface OtpProvider {
  send(phone: string, code: string): Promise<void>;
}

export interface RecordedOtp {
  phone: string;
  code: string;
  sentAt: number;
}

/**
 * Recording provider for tests and local development. Keeps the most recent
 * dispatches in memory (bounded) so tests can retrieve codes without a live
 * vendor, and supports a one-shot failure injection for retry/failure
 * coverage. Refuses to operate in production: without a real vendor
 * configured, OTP delivery is unavailable and callers must fail closed.
 */
export class MemoryOtpProvider implements OtpProvider {
  private readonly outbox: RecordedOtp[] = [];
  private failNextReason: string | null = null;

  constructor(private readonly maxOutbox = 200) {}

  async send(phone: string, code: string): Promise<void> {
    if (process.env.APP_ENV === 'production') {
      throw new ServiceUnavailableException('OTP delivery unavailable');
    }
    if (this.failNextReason) {
      const reason = this.failNextReason;
      this.failNextReason = null;
      throw new ServiceUnavailableException(reason);
    }
    this.outbox.push({ phone, code, sentAt: Date.now() });
    if (this.outbox.length > this.maxOutbox) {
      this.outbox.splice(0, this.outbox.length - this.maxOutbox);
    }
  }

  /** Most recent dispatch to the given normalized phone, if any. */
  lastSentTo(phone: string): RecordedOtp | undefined {
    for (let i = this.outbox.length - 1; i >= 0; i -= 1) {
      if (this.outbox[i].phone === phone) return this.outbox[i];
    }
    return undefined;
  }

  get sent(): readonly RecordedOtp[] {
    return this.outbox;
  }

  /** Next `send` rejects with a 503 carrying the given safe reason. */
  failNext(reason = 'OTP provider failed'): void {
    this.failNextReason = reason;
  }
}
