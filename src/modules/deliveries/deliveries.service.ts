import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager, IsNull, Repository } from 'typeorm';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';
import { resolveBillableDistance } from '../../common/geo/distance';
import { parseMoney } from '../../common/money/money';
import {
  BusinessMember,
  BusinessMemberStatus,
} from '../businesses/entities/business-member.entity';
import {
  Business,
  BusinessStatus,
} from '../businesses/entities/business.entity';
import { IdempotencyService } from '../idempotency/idempotency.service';
import { PricingService } from '../pricing/pricing.service';
import {
  AdminRole,
  AdminRoleAssignment,
} from '../users/entities/admin-role-assignment.entity';
import { DriverProfile } from '../users/entities/driver-profile.entity';
import { ZonesService } from '../zones/zones.service';
import {
  CancelDeliveryDto,
  CreateDeliveryDto,
  TransitionDeliveryDto,
} from './dto/delivery.dto';
import { toDeliveryResponse } from './dto/delivery-response.dto';
import {
  AddressKind,
  DeliveryAddress,
} from './entities/delivery-address.entity';
import {
  ActorType,
  DeliveryStatusHistory,
} from './entities/delivery-status-history.entity';
import {
  Delivery,
  DeliveryStatus,
  PaymentMethod,
} from './entities/delivery.entity';
import { Recipient } from './entities/recipient.entity';
import {
  ActorKind,
  assertTransition,
} from './state-machine/delivery-state-machine';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly pricing: PricingService,
    private readonly zones: ZonesService,
    private readonly idempotencyService: IdempotencyService,
    @InjectRepository(Delivery)
    private readonly deliveryRepo: Repository<Delivery>,
    @InjectRepository(Recipient)
    private readonly recipientRepo: Repository<Recipient>,
    @InjectRepository(DeliveryAddress)
    private readonly addressRepo: Repository<DeliveryAddress>,
    @InjectRepository(DeliveryStatusHistory)
    private readonly historyRepo: Repository<DeliveryStatusHistory>,
    @InjectRepository(BusinessMember)
    private readonly businessMembers: Repository<BusinessMember>,
    @InjectRepository(Business)
    private readonly businesses: Repository<Business>,
    @InjectRepository(DriverProfile)
    private readonly driverProfiles: Repository<DriverProfile>,
    @InjectRepository(AdminRoleAssignment)
    private readonly adminRoles: Repository<AdminRoleAssignment>,
  ) {}

  async create(
    dto: CreateDeliveryDto,
    actorUserId: string,
    idempotencyKey?: string,
  ): Promise<Delivery> {
    const businessId = dto.businessId ?? null;
    if (businessId) {
      await this.assertBusinessActive(businessId, this.businesses);
      await this.assertActiveBusinessMember(
        businessId,
        actorUserId,
        this.businessMembers,
      );
    }

    // C01: caller distance is untrusted — floor it at the trusted
    // haversine distance derived from validated coordinates, so a missing
    // or understated distance can never bypass the per-km fee.
    const trustedDistanceKm = resolveBillableDistance(
      dto.distanceKm,
      {
        latitude: dto.pickupAddress.latitude,
        longitude: dto.pickupAddress.longitude,
      },
      {
        latitude: dto.recipient.latitude,
        longitude: dto.recipient.longitude,
      },
    );
    const codAmount = parseMoney(dto.codAmount ?? '0', 'codAmount');
    const zone = await this.zones.findZoneForPoint(
      dto.recipient.longitude,
      dto.recipient.latitude,
      businessId,
    );
    const fee = await this.pricing.computeFee(actorUserId, {
      businessId,
      zoneId: zone?.id ?? null,
      codAmount: codAmount.toString(),
      distanceKm: trustedDistanceKm,
      currency: dto.currency,
    });
    const deliveryFee = parseMoney(fee.totalFee, 'deliveryFee');
    const collectableAmount = codAmount + deliveryFee;
    parseMoney(collectableAmount.toString(), 'collectableAmount');

    return await this.dataSource.transaction(async (manager) => {
      const deliveryRepo = manager.getRepository(Delivery);
      const recipientRepo = manager.getRepository(Recipient);
      const addressRepo = manager.getRepository(DeliveryAddress);
      const historyRepo = manager.getRepository(DeliveryStatusHistory);

      if (idempotencyKey) {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
          `delivery.create:${actorUserId}:${idempotencyKey}`,
        ]);

        const existing = await this.idempotencyService.findExisting(
          actorUserId,
          'delivery.create',
          idempotencyKey,
          manager,
        );
        if (existing) {
          await this.idempotencyService.checkAndReplay(
            actorUserId,
            'delivery.create',
            idempotencyKey,
            dto,
            manager,
          );
          const replayedDelivery = await deliveryRepo.findOne({
            where: { id: existing.resultantAggregateId },
          });
          if (!replayedDelivery) {
            throw new ConflictException(
              'Idempotency record references a missing delivery',
            );
          }
          return replayedDelivery;
        }
      }

      const delivery = await deliveryRepo.save(
        deliveryRepo.create({
          trackingCode: this.generateTrackingCode(),
          secureTrackingToken: this.generateSecureToken(),
          createdByUserId: actorUserId,
          businessId,
          driverId: null,
          zoneId: zone?.id ?? null,
          status: DeliveryStatus.CREATED,
          version: 1,
          currency: fee.currency,
          codAmount: codAmount.toString(),
          deliveryFee: deliveryFee.toString(),
          collectableAmount: collectableAmount.toString(),
          // C01: immutable quote provenance — rule, authoritative inputs,
          // and full breakdown survive later pricing changes.
          pricingRuleId: fee.pricingRuleId,
          quotedDistanceKm: trustedDistanceKm,
          feeBreakdown: {
            pricingRuleId: fee.pricingRuleId,
            pricingRuleEffectiveFrom: fee.pricingRuleEffectiveFrom,
            distanceKm: trustedDistanceKm,
            baseFee: fee.baseFee,
            zoneSurcharge: fee.zoneSurcharge,
            perKmFee: fee.perKmFee,
            codFee: fee.codFee,
            totalFee: fee.totalFee,
            currency: fee.currency,
          },
          paymentMethod: dto.paymentMethod ?? PaymentMethod.COD,
          notes: dto.notes ?? null,
          scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
          pickedUpAt: null,
          deliveredAt: null,
        }),
      );

      await recipientRepo.save(
        recipientRepo.create({
          deliveryId: delivery.id,
          userId: null,
          name: dto.recipient.name,
          phone: dto.recipient.phone,
          countryCode: dto.recipient.countryCode ?? 'LB',
          regionId: dto.recipient.regionId ?? null,
          city: dto.recipient.city,
          street: dto.recipient.street ?? null,
          building: dto.recipient.building ?? null,
          floor: dto.recipient.floor ?? null,
          apartment: dto.recipient.apartment ?? null,
          landmark: dto.recipient.landmark ?? null,
          instructions: dto.recipient.instructions ?? null,
          latitude: dto.recipient.latitude,
          longitude: dto.recipient.longitude,
        }),
      );

      await addressRepo.save(
        addressRepo.create({
          deliveryId: delivery.id,
          kind: AddressKind.PICKUP,
          countryCode: dto.pickupAddress.countryCode ?? 'LB',
          regionId: dto.pickupAddress.regionId ?? null,
          city: dto.pickupAddress.city,
          street: dto.pickupAddress.street ?? null,
          building: dto.pickupAddress.building ?? null,
          floor: dto.pickupAddress.floor ?? null,
          apartment: dto.pickupAddress.apartment ?? null,
          landmark: dto.pickupAddress.landmark ?? null,
          instructions: dto.pickupAddress.instructions ?? null,
          latitude: dto.pickupAddress.latitude,
          longitude: dto.pickupAddress.longitude,
          contactName: dto.pickupAddress.contactName ?? null,
          contactPhone: dto.pickupAddress.contactPhone ?? null,
        }),
      );

      await historyRepo.save(
        historyRepo.create({
          deliveryId: delivery.id,
          fromStatus: null,
          toStatus: DeliveryStatus.CREATED,
          actorType: businessId ? ActorType.BUSINESS : ActorType.USER,
          actorId: actorUserId,
          reason: null,
          note: 'Created',
        }),
      );

      // Record idempotency key if provided
      if (idempotencyKey) {
        await this.idempotencyService.record(
          actorUserId,
          'delivery.create',
          idempotencyKey,
          dto,
          delivery.id,
          toDeliveryResponse(delivery),
          24,
          manager,
        );
      }

      return delivery;
    });
  }

  async findById(id: string): Promise<Delivery> {
    const delivery = await this.deliveryRepo.findOne({ where: { id } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  async findAuthorizedById(id: string, userId: string): Promise<Delivery> {
    const delivery = await this.findById(id);
    await this.assertReadAccess(delivery, userId);
    return delivery;
  }

  async findAll(
    userId: string,
    filters: {
      businessId?: string;
      driverId?: string;
      status?: DeliveryStatus;
      take: number;
      skip: number;
    },
  ): Promise<Delivery[]> {
    const { businessId, driverId, status, take, skip } = filters;
    const where: Record<string, unknown> = {};

    if (driverId) {
      const profile = await this.driverProfiles.findOne({
        where: { id: driverId, userId, active: true },
      });
      if (!profile) throw new ForbiddenException('Not your driver profile');
      where.driverId = driverId;
    } else if (businessId) {
      await this.assertActiveBusinessMember(
        businessId,
        userId,
        this.businessMembers,
      );
      where.businessId = businessId;
    } else {
      where.createdByUserId = userId;
      where.businessId = IsNull();
    }
    if (status) where.status = status;

    return await this.deliveryRepo.find({
      where,
      order: { createdAt: 'DESC', id: 'DESC' },
      take,
      skip,
    });
  }

  async transitionAsAdmin(
    id: string,
    dto: TransitionDeliveryDto,
    actorUserId: string,
  ): Promise<Delivery> {
    await this.assertAdmin(actorUserId);
    if (dto.toStatus === DeliveryStatus.ASSIGNED) {
      throw new BadRequestException(
        'Driver assignment is unavailable until Phase 5',
      );
    }
    return await this.transitionAtomic(
      id,
      dto,
      { type: ActorType.ADMIN, id: actorUserId },
      'admin',
    );
  }

  async cancelAsSender(
    id: string,
    dto: CancelDeliveryDto,
    actorUserId: string,
  ): Promise<Delivery> {
    return await this.dataSource.transaction(async (manager) => {
      const deliveryRepo = manager.getRepository(Delivery);
      const delivery = await deliveryRepo.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!delivery) throw new NotFoundException('Delivery not found');

      let actorType = ActorType.USER;
      let actorKind: ActorKind = 'user';
      if (delivery.businessId) {
        await this.assertBusinessActive(
          delivery.businessId,
          manager.getRepository(Business),
        );
        await this.assertActiveBusinessMember(
          delivery.businessId,
          actorUserId,
          manager.getRepository(BusinessMember),
        );
        actorType = ActorType.BUSINESS;
        actorKind = 'business';
      } else if (delivery.createdByUserId !== actorUserId) {
        throw new ForbiddenException('Not your delivery');
      }

      return await this.applyTransition(
        manager,
        delivery,
        {
          toStatus: DeliveryStatus.CANCELLED,
          expectedVersion: dto.expectedVersion,
          reason: dto.reason,
        },
        { type: actorType, id: actorUserId },
        actorKind,
      );
    });
  }

  async getHistory(
    id: string,
    userId: string,
    page: PaginationQueryDto,
  ): Promise<DeliveryStatusHistory[]> {
    const delivery = await this.findById(id);
    await this.assertReadAccess(delivery, userId);
    return await this.historyRepo.find({
      where: { deliveryId: id },
      order: { occurredAt: 'ASC', id: 'ASC' },
      take: page.take,
      skip: page.skip,
    });
  }

  async getDetails(
    id: string,
    userId: string,
  ): Promise<{
    delivery: Delivery;
    recipient: Recipient;
    pickup: DeliveryAddress;
  }> {
    const delivery = await this.findById(id);
    await this.assertReadAccess(delivery, userId);
    const [recipient, pickup] = await Promise.all([
      this.recipientRepo.findOne({ where: { deliveryId: id } }),
      this.addressRepo.findOne({
        where: { deliveryId: id, kind: AddressKind.PICKUP },
      }),
    ]);
    if (!recipient || !pickup) {
      throw new NotFoundException('Delivery details not found');
    }
    return { delivery, recipient, pickup };
  }

  private async transitionAtomic(
    id: string,
    dto: TransitionDeliveryDto,
    actor: { type: ActorType; id: string | null },
    actorKind: ActorKind,
  ): Promise<Delivery> {
    return await this.dataSource.transaction(async (manager) => {
      const delivery = await manager.getRepository(Delivery).findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!delivery) throw new NotFoundException('Delivery not found');
      return await this.applyTransition(
        manager,
        delivery,
        dto,
        actor,
        actorKind,
      );
    });
  }

  private async applyTransition(
    manager: EntityManager,
    delivery: Delivery,
    dto: TransitionDeliveryDto,
    actor: { type: ActorType; id: string | null },
    actorKind: ActorKind,
  ): Promise<Delivery> {
    if (delivery.version !== dto.expectedVersion) {
      throw new ConflictException('Delivery was modified by another request');
    }
    assertTransition(delivery.status, dto.toStatus, actorKind);
    this.assertEvidence(delivery.status, dto);
    if (dto.toStatus === DeliveryStatus.IN_TRANSIT && !delivery.driverId) {
      throw new BadRequestException(
        'A driver must be assigned before dispatch',
      );
    }

    const patch: Partial<
      Pick<
        Delivery,
        'status' | 'version' | 'pickedUpAt' | 'deliveredAt' | 'scheduledAt'
      >
    > = {
      status: dto.toStatus,
      version: dto.expectedVersion + 1,
    };
    if (dto.toStatus === DeliveryStatus.PICKED_UP)
      patch.pickedUpAt = new Date();
    if (dto.toStatus === DeliveryStatus.DELIVERED)
      patch.deliveredAt = new Date();
    if (dto.toStatus === DeliveryStatus.RESCHEDULED && dto.scheduledAt) {
      patch.scheduledAt = new Date(dto.scheduledAt);
    }

    const deliveryRepo = manager.getRepository(Delivery);
    const result = await deliveryRepo.update(
      { id: delivery.id, version: dto.expectedVersion },
      patch,
    );
    if (result.affected !== 1) {
      throw new ConflictException('Delivery was modified by another request');
    }

    await manager.getRepository(DeliveryStatusHistory).save(
      manager.getRepository(DeliveryStatusHistory).create({
        deliveryId: delivery.id,
        fromStatus: delivery.status,
        toStatus: dto.toStatus,
        actorType: actor.type,
        actorId: actor.id,
        reason: dto.reason ?? null,
        note: dto.note ?? null,
      }),
    );

    const updated = await deliveryRepo.findOne({ where: { id: delivery.id } });
    if (!updated) throw new NotFoundException('Delivery not found');
    return updated;
  }

  private assertEvidence(
    from: DeliveryStatus,
    dto: TransitionDeliveryDto,
  ): void {
    const requiresReason =
      dto.toStatus === DeliveryStatus.FAILED ||
      dto.toStatus === DeliveryStatus.RETURNED ||
      dto.toStatus === DeliveryStatus.CANCELLED ||
      (from === DeliveryStatus.ASSIGNED &&
        dto.toStatus === DeliveryStatus.CREATED) ||
      dto.toStatus === DeliveryStatus.RESCHEDULED;
    if (requiresReason && !dto.reason?.trim()) {
      throw new BadRequestException('A transition reason is required');
    }
    if (dto.toStatus === DeliveryStatus.RESCHEDULED && !dto.scheduledAt) {
      throw new BadRequestException(
        'scheduledAt is required when rescheduling',
      );
    }
  }

  private async assertReadAccess(
    delivery: Delivery,
    userId: string,
  ): Promise<void> {
    if (!delivery.businessId && delivery.createdByUserId === userId) return;
    if (
      delivery.businessId &&
      (await this.businessMembers.findOne({
        where: {
          businessId: delivery.businessId,
          userId,
          status: BusinessMemberStatus.ACTIVE,
          deletedAt: IsNull(),
        },
      }))
    ) {
      return;
    }
    if (
      delivery.driverId &&
      (await this.driverProfiles.findOne({
        where: { id: delivery.driverId, userId, active: true },
      }))
    ) {
      return;
    }
    const recipient = await this.recipientRepo.findOne({
      where: { deliveryId: delivery.id, userId },
    });
    if (recipient) return;
    if (
      await this.adminRoles.findOne({
        where: [
          { userId, role: AdminRole.SUPER_ADMIN, active: true },
          { userId, role: AdminRole.ADMIN, active: true },
          { userId, role: AdminRole.SUPPORT, active: true },
        ],
      })
    ) {
      return;
    }
    throw new NotFoundException('Delivery not found or access denied');
  }

  private async assertActiveBusinessMember(
    businessId: string,
    userId: string,
    repository: Repository<BusinessMember>,
  ): Promise<BusinessMember> {
    const member = await repository.findOne({
      where: {
        businessId,
        userId,
        status: BusinessMemberStatus.ACTIVE,
        deletedAt: IsNull(),
      },
    });
    if (!member) {
      throw new ForbiddenException('Not an active member of this business');
    }
    return member;
  }

  private async assertBusinessActive(
    businessId: string,
    repository: Repository<Business>,
  ): Promise<void> {
    const business = await repository.findOne({ where: { id: businessId } });
    if (!business) throw new NotFoundException('Business not found');
    if (business.status === BusinessStatus.SUSPENDED) {
      throw new ForbiddenException('Business is suspended');
    }
  }

  private async assertAdmin(userId: string): Promise<void> {
    const assignment = await this.adminRoles.findOne({
      where: [
        { userId, role: AdminRole.SUPER_ADMIN, active: true },
        { userId, role: AdminRole.ADMIN, active: true },
        { userId, role: AdminRole.SUPPORT, active: true },
      ],
    });
    if (!assignment) throw new ForbiddenException('Admin role required');
  }

  private generateTrackingCode(): string {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = randomBytes(3).toString('hex').toUpperCase();
    return `DLV-${timestamp}-${random}`;
  }

  private generateSecureToken(): string {
    return randomBytes(32).toString('hex');
  }
}
