#!/usr/bin/env node
/**
 * staging-verify.mjs — Verify a running staging/production instance
 *
 * Usage:
 *   APP_URL=https://your-staging-url npm run staging:verify
 */

const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
let passed = 0;
let failed = 0;

async function check(name, fn) {
  try {
    const result = await fn();
    if (result.pass) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.log(`  ✗ ${name}: ${result.reason}`);
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ ${name}: ${err.message}`);
    failed++;
  }
}

console.log('');
console.log(`Verifying staging instance at: ${appUrl}`);
console.log('');

await check('Health endpoint reachable', async () => {
  const res = await fetch(`${appUrl}/api/v1/health`);
  if (!res.ok && res.status !== 503) return { pass: false, reason: `HTTP ${res.status}` };
  return { pass: true };
});

await check('Health endpoint returns JSON with status', async () => {
  const res = await fetch(`${appUrl}/api/v1/health`);
  const data = await res.json();
  if (!data.status) return { pass: false, reason: 'No status field' };
  return { pass: true };
});

await check('Database is connected in health check', async () => {
  const res = await fetch(`${appUrl}/api/v1/health`);
  const data = await res.json();
  if (data.checks?.database?.status !== 'ok') {
    return { pass: false, reason: `Database status: ${data.checks?.database?.status} — ${data.checks?.database?.detail}` };
  }
  return { pass: true };
});

await check('Login endpoint exists and requires credentials', async () => {
  const res = await fetch(`${appUrl}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'nonexistent@test.com', password: 'badpass' }),
  });
  if (res.status !== 401) return { pass: false, reason: `Expected 401, got ${res.status}` };
  return { pass: true };
});

await check('Protected endpoints reject unauthenticated requests', async () => {
  const res = await fetch(`${appUrl}/api/v1/rides`);
  if (res.status !== 401) return { pass: false, reason: `Expected 401, got ${res.status}` };
  return { pass: true };
});

await check('Invalid/malformed tokens are rejected', async () => {
  const res = await fetch(`${appUrl}/api/v1/rides`, {
    headers: { Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI.invalid.token' },
  });
  if (res.status === 200) return { pass: false, reason: 'Invalid token was accepted — fake auth may still be active!' };
  if (res.status !== 401 && res.status !== 403) return { pass: false, reason: `Expected 401/403, got ${res.status}` };
  return { pass: true };
});

await check('Google Maps endpoint returns 503 or 200 (not fake data)', async () => {
  const res = await fetch(`${appUrl}/api/v1/routing/directions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer invalid' },
    body: JSON.stringify({ origin: { lat: 37.7, lng: -122.4 }, destination: { lat: 37.4, lng: -122.1 } }),
  });
  // Should be 401 (invalid token), not 200 with fake data
  if (res.status === 200) {
    const data = await res.json();
    if (data.routes?.some(r => r.route_id?.startsWith('corridor-'))) {
      return { pass: false, reason: 'Fake simulated route data returned!' };
    }
  }
  return { pass: true };
});

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log('');

if (failed > 0) {
  console.error('STAGING VERIFICATION: FAIL');
  process.exit(1);
} else {
  console.log('STAGING VERIFICATION: PASS');
}
