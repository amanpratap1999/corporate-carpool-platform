import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@/infrastructure/db/client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/health
 *
 * Returns application health status including database, configuration,
 * and runtime checks. Safe to call unauthenticated — never exposes secrets.
 */
export async function GET() {
  const checks: Record<
    string,
    { status: 'ok' | 'degraded' | 'down'; detail?: string; latencyMs?: number }
  > = {};

  // --- Persistence ---
  const storageMode = (process.env.STORAGE_MODE ||
    (process.env.NODE_ENV === 'production' ? 'postgres' : 'memory')).toLowerCase();
  if (storageMode === 'memory' && process.env.NODE_ENV !== 'production' && process.env.APP_ENV !== 'staging') {
    checks.database = {
      status: 'ok',
      detail: 'In-memory development storage active; data resets on restart',
    };
  } else {
    const dbResult = await checkDatabaseHealth();
    checks.database = dbResult.connected
      ? { status: 'ok', latencyMs: dbResult.latencyMs }
      : {
          status: 'down',
          detail: dbResult.error || (process.env.DATABASE_URL ? 'Database connection failed' : 'DATABASE_URL not configured'),
        };
  }

  // --- Google Maps ---
  const hasMapsKey = !!process.env.GOOGLE_MAPS_API_KEY;
  const hasBrowserKey = !!process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  checks.google_maps = hasMapsKey && hasBrowserKey
    ? { status: 'ok' }
    : hasMapsKey || hasBrowserKey
    ? {
        status: 'degraded',
        detail: hasMapsKey
          ? 'Server key configured but browser key missing — map rendering unavailable'
          : 'Browser key configured but server key missing — routing API unavailable',
      }
    : {
        status: 'degraded',
        detail: 'Google Maps not configured — routing and map features unavailable',
      };

  // --- JWT ---
  const hasJwtSecret = !!process.env.JWT_SECRET;
  const isTestOrDemo = process.env.NODE_ENV === 'test' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

  checks.jwt = hasJwtSecret
    ? { status: 'ok' }
    : {
        status: isTestOrDemo ? 'degraded' : 'down',
        detail: 'JWT_SECRET not set',
      };

  // --- Cron secret ---
  const hasCronSecret = !!process.env.CRON_SECRET;
  checks.cron_secret = hasCronSecret
    ? { status: 'ok' }
    : {
        status: isTestOrDemo ? 'degraded' : 'down',
        detail: 'CRON_SECRET not configured',
      };

  const statuses = Object.values(checks).map((c) => c.status);
  const anyDown = statuses.includes('down');
  const anyDegraded = statuses.includes('degraded');
  const overall = anyDown ? 'down' : anyDegraded ? 'degraded' : 'ok';
  
  const httpStatus = anyDown ? 503 : 200;

  return NextResponse.json(
    {
      status: overall,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      checks,
    },
    { status: httpStatus }
  );
}
