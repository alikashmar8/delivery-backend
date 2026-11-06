import { MigrationInterface, QueryRunner } from 'typeorm';

/** Immutable rename list for the legacy schema created by migrations 0 through 6. */
const columnRenames: ReadonlyArray<{
  table: string;
  columns: ReadonlyArray<readonly [legacyName: string, fieldName: string]>;
}> = [
  {
    table: 'delivery_zones',
    columns: [
      ['business_id', 'businessId'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ],
  },
  {
    table: 'regions',
    columns: [
      ['parent_id', 'parentId'],
      ['country_code', 'countryCode'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ],
  },
  {
    table: 'business_members',
    columns: [
      ['business_id', 'businessId'],
      ['user_id', 'userId'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
      ['deleted_at', 'deletedAt'],
    ],
  },
  {
    table: 'businesses',
    columns: [
      ['settlement_config', 'settlementConfig'],
      ['contact_phone', 'contactPhone'],
      ['legal_name', 'legalName'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ],
  },
  {
    table: 'driver_profiles',
    columns: [
      ['user_id', 'userId'],
      ['vehicle_type', 'vehicleType'],
      ['vehicle_plate', 'vehiclePlate'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ],
  },
  {
    table: 'refresh_tokens',
    columns: [
      ['user_id', 'userId'],
      ['token_hash', 'tokenHash'],
      ['expires_at', 'expiresAt'],
      ['revoked_at', 'revokedAt'],
      ['created_at', 'createdAt'],
    ],
  },
  {
    table: 'users',
    columns: [
      ['password_hash', 'passwordHash'],
      ['display_name', 'displayName'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
      ['deleted_at', 'deletedAt'],
    ],
  },
  {
    table: 'admin_role_assignments',
    columns: [
      ['user_id', 'userId'],
      ['granted_by_id', 'grantedById'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ],
  },
  {
    table: 'recipients',
    columns: [
      ['delivery_id', 'deliveryId'],
      ['user_id', 'userId'],
      ['country_code', 'countryCode'],
      ['region_id', 'regionId'],
      ['created_at', 'createdAt'],
    ],
  },
  {
    table: 'deliveries',
    columns: [
      ['tracking_code', 'trackingCode'],
      ['secure_tracking_token', 'secureTrackingToken'],
      ['created_by_user_id', 'createdByUserId'],
      ['business_id', 'businessId'],
      ['driver_id', 'driverId'],
      ['zone_id', 'zoneId'],
      ['cod_amount', 'codAmount'],
      ['delivery_fee', 'deliveryFee'],
      ['collectable_amount', 'collectableAmount'],
      ['payment_method', 'paymentMethod'],
      ['scheduled_at', 'scheduledAt'],
      ['picked_up_at', 'pickedUpAt'],
      ['delivered_at', 'deliveredAt'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ],
  },
  {
    table: 'delivery_status_history',
    columns: [
      ['delivery_id', 'deliveryId'],
      ['from_status', 'fromStatus'],
      ['to_status', 'toStatus'],
      ['actor_type', 'actorType'],
      ['actor_id', 'actorId'],
      ['occurred_at', 'occurredAt'],
    ],
  },
  {
    table: 'delivery_addresses',
    columns: [
      ['delivery_id', 'deliveryId'],
      ['country_code', 'countryCode'],
      ['region_id', 'regionId'],
      ['contact_name', 'contactName'],
      ['contact_phone', 'contactPhone'],
      ['created_at', 'createdAt'],
    ],
  },
  {
    table: 'addresses',
    columns: [
      ['user_id', 'userId'],
      ['country_code', 'countryCode'],
      ['region_id', 'regionId'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
      ['deleted_at', 'deletedAt'],
    ],
  },
  {
    table: 'pricing_rules',
    columns: [
      ['business_id', 'businessId'],
      ['zone_id', 'zoneId'],
      ['base_fee', 'baseFee'],
      ['per_km', 'perKm'],
      ['zone_surcharge', 'zoneSurcharge'],
      ['cod_fee_percent', 'codFeePercent'],
      ['effective_from', 'effectiveFrom'],
      ['effective_to', 'effectiveTo'],
      ['created_at', 'createdAt'],
      ['updated_at', 'updatedAt'],
    ],
  },
];

export class UseCamelCaseColumns1700000000007 implements MigrationInterface {
  name = 'UseCamelCaseColumns1700000000007';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const { table, columns } of columnRenames) {
      for (const [legacyName, fieldName] of columns) {
        await queryRunner.query(
          `ALTER TABLE "${table}" RENAME COLUMN "${legacyName}" TO "${fieldName}"`,
        );
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const { table, columns } of [...columnRenames].reverse()) {
      for (const [legacyName, fieldName] of [...columns].reverse()) {
        await queryRunner.query(
          `ALTER TABLE "${table}" RENAME COLUMN "${fieldName}" TO "${legacyName}"`,
        );
      }
    }
  }
}
