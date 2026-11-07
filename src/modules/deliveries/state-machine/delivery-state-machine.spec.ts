import { ConflictException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { DeliveryStatus } from '../entities/delivery.entity';
import {
  assertTransition,
  canTransition,
  type ActorKind,
} from './delivery-state-machine';

// Independent transcription of docs/delivery_state_machine.md; never derive expectations from TRANSITIONS.
const allowed: Record<ActorKind, string[]> = {
  user: ['CREATED:CANCELLED', 'ASSIGNED:CANCELLED'],
  business: ['CREATED:CANCELLED', 'ASSIGNED:CANCELLED'],
  driver: [
    'ASSIGNED:ACCEPTED',
    'ACCEPTED:PICKED_UP',
    'PICKED_UP:IN_TRANSIT',
    'PICKED_UP:FAILED',
    'IN_TRANSIT:ARRIVED',
    'IN_TRANSIT:FAILED',
    'ARRIVED:DELIVERED',
    'ARRIVED:FAILED',
    'FAILED:RETURNED',
    'RESCHEDULED:IN_TRANSIT',
  ],
  system: [
    'CREATED:ASSIGNED',
    'CREATED:CANCELLED',
    'ASSIGNED:CANCELLED',
    'RESCHEDULED:IN_TRANSIT',
  ],
  admin: [
    'CREATED:ASSIGNED',
    'CREATED:CANCELLED',
    'ASSIGNED:CREATED',
    'ASSIGNED:CANCELLED',
    'ACCEPTED:CANCELLED',
    'PICKED_UP:FAILED',
    'PICKED_UP:CANCELLED',
    'IN_TRANSIT:FAILED',
    'IN_TRANSIT:CANCELLED',
    'ARRIVED:FAILED',
    'FAILED:RESCHEDULED',
    'FAILED:RETURNED',
    'RESCHEDULED:IN_TRANSIT',
    'RESCHEDULED:CANCELLED',
  ],
};

describe('D01 exhaustive approved FSM (11 × 11 × 5 actor combinations)', () => {
  for (const actor of Object.keys(allowed) as ActorKind[]) {
    for (const from of Object.values(DeliveryStatus)) {
      for (const to of Object.values(DeliveryStatus)) {
        it(`${actor}: ${from} → ${to}`, () => {
          const legal = allowed[actor].includes(`${from}:${to}`);
          expect(canTransition(from, to, actor)).toBe(legal);
          if (legal)
            expect(() => assertTransition(from, to, actor)).not.toThrow();
          else
            expect(() => assertTransition(from, to, actor)).toThrow(
              ConflictException,
            );
        });
      }
    }
  }
});
