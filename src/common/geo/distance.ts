import { BadRequestException } from '@nestjs/common';

/**
 * Trusted distance policy (C01).
 *
 * Problem (audit A07): `distanceKm` is caller-supplied and optional, so a
 * caller could omit it (or understate it) and silently skip the per-km fee.
 *
 * Policy: the pickup/recipient coordinates are validated server-side
 * (lat/lng ranges via DTO validation), so the straight-line (haversine)
 * distance derived from them is trusted. It acts as a FLOOR:
 * - caller omits `distanceKm` → bill on the haversine distance;
 * - caller supplies `distanceKm` >= haversine (e.g. real road distance) →
 *   bill on the caller value;
 * - caller supplies `distanceKm` < haversine → reject (400), because no
 *   real route can be shorter than the straight line.
 *
 * Inflating the distance only raises the sender's own fee, so the only
 * fraud vector worth blocking is deflation, which the floor removes.
 * All distances are rounded to 6 decimals so persisted values and the
 * scaled-integer pricing math stay deterministic.
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;
const DISTANCE_SCALE = 1_000_000;
/** Tolerance for float dust when comparing caller distance to the floor. */
const FLOOR_EPSILON_KM = 1e-9;

export function roundDistanceKm(value: number): number {
  return Math.round(value * DISTANCE_SCALE) / DISTANCE_SCALE;
}

/** Great-circle distance in km between two validated coordinates. */
export function haversineKm(from: GeoPoint, to: GeoPoint): number {
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) *
      Math.cos(toRad(to.latitude)) *
      Math.sin(dLng / 2) ** 2;
  return roundDistanceKm(
    2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a))),
  );
}

/**
 * Resolve the billable distance for a delivery.
 * @throws BadRequestException when the caller distance is below the floor.
 */
export function resolveBillableDistance(
  callerDistanceKm: number | undefined,
  pickup: GeoPoint,
  recipient: GeoPoint,
): number {
  const floor = haversineKm(pickup, recipient);
  if (callerDistanceKm === undefined) return floor;
  const caller = roundDistanceKm(callerDistanceKm);
  if (caller + FLOOR_EPSILON_KM < floor) {
    throw new BadRequestException(
      'distanceKm is below the straight-line minimum for this route',
    );
  }
  return caller;
}
