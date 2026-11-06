import type { Request } from 'express';

export type AuditRequestContext = {
  ipAddress?: string | null;
  userAgent?: string | null;
};

export function getAuditRequestContext(
  request: Request,
): AuditRequestContext {
  return {
    ipAddress: request.ip || null,
    userAgent: request.get('user-agent') || null,
  };
}