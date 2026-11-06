/**
 * Coordinate serialization utilities
 * 
 * Addresses A10: PostgreSQL NUMERIC values can be returned as strings by the pg driver,
 * but our API contract promises numeric coordinates. This transformer ensures consistent
 * serialization.
 */

import { Transform } from 'class-transformer';

/**
 * Ensures coordinate values are serialized as numbers, not strings.
 * 
 * PostgreSQL NUMERIC columns may be returned as strings by the pg driver to preserve
 * precision. For latitude/longitude coordinates, we want guaranteed numeric serialization
 * in JSON responses.
 * 
 * Usage:
 *   @CoordinateNumber()
 *   latitude: number;
 */
export function CoordinateNumber() {
  return Transform(({ value }) => {
    if (value === null || value === undefined) {
      return value;
    }
    const num = typeof value === 'string' ? parseFloat(value) : value;
    // Validate it's actually a valid coordinate-like number
    if (typeof num !== 'number' || isNaN(num)) {
      return value; // preserve original if conversion fails
    }
    return num;
  }, { toClassOnly: false, toPlainOnly: true });
}

/**
 * Ensures monetary values remain as strings in minor units.
 * 
 * Financial amounts use integer minor units stored as BIGINT. PostgreSQL returns
 * these as strings to avoid precision loss. We intentionally keep them as strings
 * in responses to prevent JavaScript number precision issues.
 * 
 * Usage:
 *   @MoneyString()
 *   baseFee: string;
 */
export function MoneyString() {
  return Transform(({ value }) => {
    if (value === null || value === undefined) {
      return value;
    }
    // Ensure it's a string representation of an integer
    return String(value);
  }, { toClassOnly: false, toPlainOnly: true });
}
