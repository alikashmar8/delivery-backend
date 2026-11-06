import { ConflictException } from '@nestjs/common';
import { DeliveryStatus } from '../entities/delivery.entity';

export type ActorKind = 'user' | 'business' | 'driver' | 'system' | 'admin';

type TransitionRule = Partial<Record<DeliveryStatus, ActorKind[]>>;

export const TRANSITIONS: Record<DeliveryStatus, TransitionRule> = {
  [DeliveryStatus.CREATED]: {
    [DeliveryStatus.ASSIGNED]: ['admin', 'system'],
    [DeliveryStatus.CANCELLED]: ['user', 'business', 'admin', 'system'],
  },
  [DeliveryStatus.ASSIGNED]: {
    [DeliveryStatus.ACCEPTED]: ['driver'],
    [DeliveryStatus.CANCELLED]: ['user', 'business', 'admin', 'system'],
    [DeliveryStatus.CREATED]: ['admin'],
  },
  [DeliveryStatus.ACCEPTED]: {
    [DeliveryStatus.PICKED_UP]: ['driver'],
    [DeliveryStatus.CANCELLED]: ['admin'],
  },
  [DeliveryStatus.PICKED_UP]: {
    [DeliveryStatus.IN_TRANSIT]: ['driver'],
    [DeliveryStatus.FAILED]: ['driver', 'admin'],
    [DeliveryStatus.CANCELLED]: ['admin'],
  },
  [DeliveryStatus.IN_TRANSIT]: {
    [DeliveryStatus.ARRIVED]: ['driver'],
    [DeliveryStatus.FAILED]: ['driver', 'admin'],
    [DeliveryStatus.CANCELLED]: ['admin'],
  },
  [DeliveryStatus.ARRIVED]: {
    [DeliveryStatus.DELIVERED]: ['driver'],
    [DeliveryStatus.FAILED]: ['driver', 'admin'],
  },
  [DeliveryStatus.DELIVERED]: {},
  [DeliveryStatus.FAILED]: {
    [DeliveryStatus.RESCHEDULED]: ['admin'],
    [DeliveryStatus.RETURNED]: ['driver', 'admin'],
  },
  [DeliveryStatus.RESCHEDULED]: {
    [DeliveryStatus.IN_TRANSIT]: ['driver', 'admin', 'system'],
    [DeliveryStatus.CANCELLED]: ['admin'],
  },
  [DeliveryStatus.RETURNED]: {},
  [DeliveryStatus.CANCELLED]: {},
};

export function canTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
  actor: ActorKind,
): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function assertTransition(
  from: DeliveryStatus,
  to: DeliveryStatus,
  actor: ActorKind,
): void {
  if (!canTransition(from, to, actor)) {
    throw new ConflictException(
      `Illegal delivery transition: ${from} → ${to} by ${actor}`,
    );
  }
}
