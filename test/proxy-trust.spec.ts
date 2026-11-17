import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

describe('Express proxy-addr security regression (GHSA-jqcg-44mw-7w3h)', () => {
  it.each([
    ['::ffff:10.0.0.0/8'],
    ['::/1'],
    ['::ffff:10.0.0.0/8', '192.0.2.0/24'],
    ['::/1', '192.0.2.0/24'],
  ])(
    'does not trust IPv4 peers through unsafe IPv6 subnet %j',
    (...subnets) => {
      const app = express().set('trust proxy', subnets);
      const trust = app.get('trust proxy fn') as (address: string) => boolean;
      expect(trust('198.51.100.23')).toBe(false);
      expect(trust('::ffff:198.51.100.23')).toBe(false);
    },
  );

  it.each([
    ['10.0.0.0/8'],
    ['::ffff:10.0.0.0/104'],
    ['10.0.0.0/8', '192.0.2.0/24'],
    ['::ffff:10.0.0.0/104', '192.0.2.0/24'],
  ])('preserves correctly scoped proxy subnet %j', (...subnets) => {
    const app = express().set('trust proxy', subnets);
    const trust = app.get('trust proxy fn') as (address: string) => boolean;
    expect(trust('10.1.2.3')).toBe(true);
    expect(trust('::ffff:10.1.2.3')).toBe(true);
    expect(trust('198.51.100.23')).toBe(false);
    expect(trust('::ffff:198.51.100.23')).toBe(false);
  });

  it.each([false, '::ffff:10.0.0.0/8', '::/1'])(
    'ignores spoofed forwarded headers over HTTP with trust %j',
    async (trust) => {
      const app = express().set('trust proxy', trust);
      app.get('/', (req, res) => res.json({ ip: req.ip, ips: req.ips }));
      const response = await request(app)
        .get('/')
        .set('X-Forwarded-For', '203.0.113.99, 10.1.2.3')
        .expect(200);
      expect(response.body.ip).toMatch(/^(::ffff:)?127\.0\.0\.1$/);
      expect(response.body.ips).toEqual([]);
    },
  );

  it.each(['127.0.0.0/8', '::ffff:127.0.0.0/104'])(
    'accepts a legitimate proxy and stops at the nearest untrusted hop with %s',
    async (trust) => {
      const app = express().set('trust proxy', trust);
      app.get('/', (req, res) => res.json({ ip: req.ip, ips: req.ips }));
      const response = await request(app)
        .get('/')
        .set('X-Forwarded-For', '203.0.113.99, 198.51.100.23')
        .expect(200);
      expect(response.body).toEqual({
        ip: '198.51.100.23',
        ips: ['198.51.100.23'],
      });
    },
  );
});
