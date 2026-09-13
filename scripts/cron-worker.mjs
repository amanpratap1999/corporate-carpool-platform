/**
 * Cron Worker Runner
 * Periodically calls the ride expiration cron endpoint via HTTP fetch.
 * Keeps CRON_SECRET in memory only (never passed as command line argument or exposed via process table).
 */

const endpoint = process.env.CRON_ENDPOINT || 'http://web:3000/api/v1/system/cron/expire';
const secret = process.env.CRON_SECRET;
const intervalSeconds = parseInt(process.env.CRON_INTERVAL_SECONDS || '300', 10);

if (!secret) {
  console.error('FATAL: CRON_SECRET is required.');
  process.exit(1);
}

console.log(`[cron-worker] Starting background worker for ${endpoint} (interval: ${intervalSeconds}s)...`);

let isRunning = true;

process.on('SIGTERM', () => {
  console.log('[cron-worker] Received SIGTERM, shutting down...');
  isRunning = false;
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[cron-worker] Received SIGINT, shutting down...');
  isRunning = false;
  process.exit(0);
});

async function triggerCycle() {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${secret}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[cron-worker] Expiration trigger failed with status ${res.status}: ${text}`);
    } else {
      const data = await res.json().catch(() => ({}));
      console.log(`[cron-worker] Cycle completed at ${new Date().toISOString()}:`, JSON.stringify(data));
    }
  } catch (err) {
    console.error('[cron-worker] Request failed:', err instanceof Error ? err.message : err);
  }
}

async function loop() {
  // Initial delay before first trigger
  await new Promise((r) => setTimeout(r, 10000));

  while (isRunning) {
    await triggerCycle();
    await new Promise((r) => setTimeout(r, intervalSeconds * 1000));
  }
}

loop();
