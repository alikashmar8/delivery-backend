import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

type Position = [number, number];

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every((coordinate) => Number.isFinite(coordinate)) &&
    value[0] >= -180 &&
    value[0] <= 180 &&
    value[1] >= -90 &&
    value[1] <= 90
  );
}

function orientation(a: Position, b: Position, c: Position): number {
  return (b[1] - a[1]) * (c[0] - b[0]) - (b[0] - a[0]) * (c[1] - b[1]);
}

function segmentsIntersect(
  a: Position,
  b: Position,
  c: Position,
  d: Position,
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);
  return o1 * o2 < 0 && o3 * o4 < 0;
}

function isValidRing(value: unknown): value is Position[] {
  if (!Array.isArray(value) || value.length < 4 || !value.every(isPosition)) {
    return false;
  }
  const ring = value as Position[];
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return false;

  const distinct = new Set(ring.slice(0, -1).map(([x, y]) => `${x}:${y}`));
  if (distinct.size < 3) return false;

  let twiceArea = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    twiceArea +=
      ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  if (twiceArea === 0) return false;

  const segmentCount = ring.length - 1;
  for (let left = 0; left < segmentCount; left += 1) {
    for (let right = left + 1; right < segmentCount; right += 1) {
      const adjacent =
        right === left + 1 || (left === 0 && right === segmentCount - 1);
      if (adjacent) continue;
      if (
        segmentsIntersect(
          ring[left],
          ring[left + 1],
          ring[right],
          ring[right + 1],
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

export function isGeoJsonPolygon(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as { type?: unknown; coordinates?: unknown };
  return (
    candidate.type === 'Polygon' &&
    Array.isArray(candidate.coordinates) &&
    candidate.coordinates.length > 0 &&
    candidate.coordinates.every(isValidRing)
  );
}

export function IsGeoJsonPolygon(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isGeoJsonPolygon',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: isGeoJsonPolygon,
        defaultMessage: (args: ValidationArguments) =>
          `${args.property} must be a valid GeoJSON Polygon with closed WGS84 rings`,
      },
    });
  };
}
