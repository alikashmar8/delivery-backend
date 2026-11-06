import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorService,
} from '@nestjs/terminus';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private indicators: HealthIndicatorService,
    @InjectDataSource() private db: DataSource,
  ) {}

  @Get()
  @HealthCheck()
  @ApiOperation({ summary: 'Health check with database connectivity' })
  @ApiResponse({
    status: 200,
    description: 'Health check passed',
    schema: {
      properties: {
        status: { type: 'string', example: 'ok' },
        info: { type: 'object' },
        error: { type: 'object' },
        details: { type: 'object' },
      },
    },
  })
  @ApiResponse({
    status: 503,
    description: 'Health check failed',
  })
  check() {
    // Keep the database probe explicit and on Terminus's public indicator API.
    return this.health.check([
      async () => {
        const indicator = this.indicators.check('database');
        try {
          await this.db.query('SELECT 1');
          return indicator.up();
        } catch {
          return indicator.down('Database ping failed');
        }
      },
    ]);
  }
}
