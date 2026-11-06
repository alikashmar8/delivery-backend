import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  haversineKm,
  resolveBillableDistance,
  roundDistanceKm,
} from './distance';

/**
 * C01: trusted distance unit tests (A07).
 * Pure-geometry checks; PostGIS behavior is covered by integration tests.
 */
describe('trusted distance (C01)', () => {
  it('returns zero for identical points', () => {
    expect(
      haversineKm(
        { latitude: 33.9, longitude: 35.5 },
        { latitude: 33.9, longitude: 35.5 },
      ),
    ).toBe(0);
  });

  it('matches the known degree length at the equator', () => {
    // 2πR/360 with R=6371 → ≈111.195 km per degree.
    const oneDegree = haversineKm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
    );
    expect(oneDegree).toBeGreaterThan(111.19);
    expect(oneDegree).toBeLessThan(111.2);
  });

  it('computes a plausible Beirut–Tripoli straight-line distance', () => {
    const beirutTripoli = haversineKm(
      { latitude: 33.8938, longitude: 35.5018 },
      { latitude: 34.4333, longitude: 35.8333 },
    );
    expect(beirutTripoli).toBeGreaterThan(60);
    expect(beirutTripoli).toBeLessThan(75);
  });

  it('rounds distances to 6 decimals deterministically', () => {
    expect(roundDistanceKm(5.123456789)).toBe(5.123457);
    expect(roundDistanceKm(haversineKm(
      { latitude: 33.9, longitude: 35.5 },
      { latitude: 33.9, longitude: 35.5 },
    ))).toBe(0);
  });

  it('uses the haversine floor when the caller omits distance', () => {
    const pickup = { latitude: 33.9, longitude: 35.5 };
    const recipient = { latitude: 34.0, longitude: 35.6 };
    expect(resolveBillableDistance(undefined, pickup, recipient)).toBe(
      haversineKm(pickup, recipient),
    );
  });

  it('accepts a caller distance at or above the floor', () => {
    const pickup = { latitude: 33.9, longitude: 35.5 };
    const recipient = { latitude: 34.0, longitude: 35.6 };
    const floor = haversineKm(pickup, recipient);
    expect(resolveBillableDistance(floor, pickup, recipient)).toBe(floor);
    // Caller input is rounded to 6dp for deterministic persistence.
    expect(resolveBillableDistance(floor + 10, pickup, recipient)).toBe(
      roundDistanceKm(floor + 10),
    );
  });

  it('rejects a caller distance below the straight-line floor', () => {
    const pickup = { latitude: 33.9, longitude: 35.5 };
    const recipient = { latitude: 34.0, longitude: 35.6 };
    const floor = haversineKm(pickup, recipient);
    expect(floor).toBeGreaterThan(1);
    expect(() =>
      resolveBillableDistance(0, pickup, recipient),
    ).toThrow(BadRequestException);
    expect(() =>
      resolveBillableDistance(floor - 0.5, pickup, recipient),
    ).toThrow(/straight-line minimum/);
  });
});
