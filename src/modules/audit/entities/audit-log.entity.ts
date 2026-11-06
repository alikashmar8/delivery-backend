import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * AuditLog entity for append-only administration audit trail.
 *
 * Purpose: Record all important administrative actions for compliance and debugging:
 * - Member addition/removal
 * - Pricing rule changes
 * - Business status changes
 * - Role assignments
 *
 * Immutable: never updated or deleted after creation.
 * JSONB before/after: captures exact state changes for reproducibility.
 * Excludes secrets: passwordHash and sensitive fields omitted from snapshots.
 */
@Entity('audit_logs')
@Index('idx_audit_logs_actor', ['actorId'])
@Index('idx_audit_logs_business', ['businessId'])
@Index('idx_audit_logs_entity', ['entityType', 'entityId'])
@Index('idx_audit_logs_created', ['createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /**
   * Actor ID (userId) who performed the action.
   * Always set; tracks who made the change.
   */
  @Column({ type: 'uuid', name: 'actorId' })
  actorId!: string;

  /**
   * Business context (nullable).
   * Set for business-scoped actions (member add/remove, pricing changes).
   * Null for platform-level actions (admin role assignments).
   */
  @Column({ type: 'uuid', name: 'businessId', nullable: true })
  businessId!: string | null;

  /**
   * Action performed (e.g., 'member.add', 'pricing.update', 'business.suspend').
   * Standardized action names for filtering and analytics.
   */
  @Column({ type: 'varchar', length: 50, name: 'action' })
  action!: string;

  /**
   * Entity type (e.g., 'BusinessMember', 'PricingRule', 'Business').
   * Distinguishes what kind of entity was affected.
   */
  @Column({ type: 'varchar', length: 50, name: 'entityType' })
  entityType!: string;

  /**
   * Entity ID affected (e.g., businessMemberId, pricingRuleId).
   * Combined with entityType, uniquely identifies the changed resource.
   */
  @Column({ type: 'uuid', name: 'entityId' })
  entityId!: string;

  /**
   * State before the action (JSONB).
   * Null for create actions; populated for update/delete/transition.
   * Excludes secrets and sensitive fields (passwordHash, etc).
   */
  @Column({ type: 'jsonb', name: 'before', nullable: true })
  before!: unknown | null;

  /**
   * State after the action (JSONB).
   * Null for delete actions; populated for create/update.
   * Excludes secrets and sensitive fields.
   */
  @Column({ type: 'jsonb', name: 'after', nullable: true })
  after!: unknown | null;

  /**
   * IP address of the request source (optional).
   * Extracted from X-Forwarded-For or request.ip.
   * Null for internal service calls.
   */
  @Column({ type: 'inet', name: 'ipAddress', nullable: true })
  ipAddress!: string | null;

  /**
   * User-Agent header (optional).
   * Identifies the client software/version.
   */
  @Column({ type: 'varchar', length: 500, name: 'userAgent', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'timestamptz', default: () => 'now()', name: 'createdAt' })
  createdAt!: Date;
}
