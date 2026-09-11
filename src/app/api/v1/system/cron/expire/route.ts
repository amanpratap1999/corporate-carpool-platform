import { NextResponse } from 'next/server';
import { rideExpirationWorker } from '@/workers/ride-expiration.worker';

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

    const report = await rideExpirationWorker.runCycle();

    return NextResponse.json({ success: true, report });
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal Server Error', details: err.message }, { status: 500 });
  }
}
