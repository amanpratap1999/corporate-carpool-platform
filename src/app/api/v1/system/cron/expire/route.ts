import { NextResponse } from 'next/server';
import { rideExpirationWorker } from '@/workers/ride-expiration.worker';
import { rateLimiter } from '@/infrastructure/security/rate-limiter';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
      }
    } else if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized cron access' }, { status: 401 });
    }

    const rl = await rateLimiter.checkShared('cron:expire', 30, 60);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: `Cron rate limit exceeded. Retry in ${rl.resetSeconds}s` },
        {
          status: 429,
          headers: { 'Retry-After': String(rl.resetSeconds) }
        }
      );
    }

    const report = await rideExpirationWorker.runCycle();

    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
