import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { appValidationPipe } from '../src/common/pipes/validation.pipe';
import { HealthController } from '../src/health/health.controller';
import { AuthController } from '../src/modules/auth/auth.controller';
import { AuthService } from '../src/modules/auth/auth.service';
import { AuthGuard } from '../src/modules/auth/guards/auth.guard';
import { BusinessesController } from '../src/modules/businesses/businesses.controller';
import { BusinessesService } from '../src/modules/businesses/businesses.service';
import { BusinessMember } from '../src/modules/businesses/entities/business-member.entity';
import { Business } from '../src/modules/businesses/entities/business.entity';
import { BusinessScopeGuard } from '../src/modules/businesses/guards/business-scope.guard';
import { User, UserStatus } from '../src/modules/users/entities/user.entity';

const TEST_SECRET = 'test-access-secret-at-least-32-characters';
const USER_ID = '00000000-0000-4000-8000-000000000001';
const OWN_BUSINESS_ID = '00000000-0000-4000-8000-000000000002';
const OTHER_BUSINESS_ID = '00000000-0000-4000-8000-000000000003';

describe('backend HTTP smoke (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    const jwt = new JwtService();
    accessToken = jwt.sign({ sub: USER_ID }, { secret: TEST_SECRET });
    const user = {
      id: USER_ID,
      status: UserStatus.ACTIVE,
    } as User;
    const userRepo = {
      findOne: vi.fn().mockResolvedValue(user),
    };
    const memberRepo = {
      findOne: vi.fn(async ({ where }) => {
        if (where.businessId !== OWN_BUSINESS_ID) return null;
        return {
          businessId: OWN_BUSINESS_ID,
          userId: USER_ID,
          role: 'owner',
          status: 'active',
          business: { status: 'active' },
        };
      }),
    };
    const businessRepo = {
      findOne: vi.fn(async () => ({ status: 'active' })),
    };
    const businesses = {
      findSummaryById: vi.fn(async (id: string) => ({
        id,
        name: 'Owned Business',
        slug: 'owned-business',
        status: 'active',
      })),
    };
    const auth = {
      sendOtp: vi.fn().mockResolvedValue({ message: 'OTP sent' }),
      verifyOtp: vi.fn(),
      register: vi.fn(),
      loginWithPassword: vi.fn(),
      loginWithOtp: vi
        .fn()
        .mockResolvedValue({ accessToken: 'otp-access', user: {} }),
      refreshTokens: vi.fn(),
      logout: vi.fn(),
    };
    const health = {
      check: vi.fn().mockResolvedValue({
        status: 'ok',
        info: { database: { status: 'up' } },
        error: {},
        details: { database: { status: 'up' } },
      }),
    };

    const module = await Test.createTestingModule({
      controllers: [HealthController, AuthController, BusinessesController],
      providers: [
        AuthGuard,
        BusinessScopeGuard,
        { provide: AuthService, useValue: auth },
        { provide: BusinessesService, useValue: businesses },
        { provide: ConfigService, useValue: { get: () => TEST_SECRET } },
        { provide: JwtService, useValue: jwt },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(BusinessMember), useValue: memberRepo },
        { provide: getRepositoryToken(Business), useValue: businessRepo },
        { provide: HealthCheckService, useValue: health },
        {
          provide: HealthIndicatorService,
          useValue: new HealthIndicatorService(),
        },
        { provide: getDataSourceToken(), useValue: { query: vi.fn() } },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(appValidationPipe);
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports health without waiting for a real database connection', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);
    expect(response.body.status).toBe('ok');
  });

  it('runs an auth smoke request without exposing an OTP', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/otp/send')
      .send({ phone: '+96171111111' })
      .expect(201);
    expect(response.body).toEqual({ message: 'OTP sent' });
    expect(JSON.stringify(response.body)).not.toContain('111111');
  });

  it('routes OTP login and validates its payload', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login/otp')
      .send({ phone: '+96171111111', code: '123456' })
      .expect(200);
    expect(response.body.accessToken).toBe('otp-access');

    await request(app.getHttpServer())
      .post('/auth/login/otp')
      .send({ phone: '+96171111111' })
      .expect(400);
  });

  it('rejects a protected endpoint without an access token', async () => {
    await request(app.getHttpServer())
      .get(`/businesses/${OWN_BUSINESS_ID}`)
      .expect(401);
  });

  it('allows protected access for an active member', async () => {
    const response = await request(app.getHttpServer())
      .get(`/businesses/${OWN_BUSINESS_ID}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(response.body.id).toBe(OWN_BUSINESS_ID);
  });

  it('rejects cross-business access despite spoofed scope headers', async () => {
    await request(app.getHttpServer())
      .get(`/businesses/${OTHER_BUSINESS_ID}?businessId=${OWN_BUSINESS_ID}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .set('x-business-id', OWN_BUSINESS_ID)
      .expect(404);
  });
});
