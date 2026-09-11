#!/usr/bin/env node
/**
 * local-check.mjs — Validate local development environment
 *
 * Usage:
 *   npm run local:check
 *
 * Checks all required and optional environment variables.
 */

import fs from 'node:fs';

// Automatically load .env.local or .env if present
if (typeof process.loadEnvFile === 'function') {
  if (fs.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  } else if (fs.existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}

const storageMode = (process.env.STORAGE_MODE || 'memory').toLowerCase();
const required = ['JWT_SECRET'];
const optional = [
  'GOOGLE_MAPS_API_KEY',
  'NEXT_PUBLIC_GOOGLE_MAPS_API_KEY',
  'CRON_SECRET',
  'NEXT_PUBLIC_APP_URL',
];

let allOk = true;

console.log('');
console.log('Checking local environment...');
console.log('');
console.log(`Storage mode: ${storageMode}`);

if (!['memory', 'postgres'].includes(storageMode)) {
  console.error('  ✗ STORAGE_MODE must be either "memory" or "postgres"');
  process.exit(1);
}

if (storageMode === 'postgres') {
  required.push('DATABASE_URL');
}

console.log('Required:');

for (const key of required) {
  if (process.env[key]) {
    console.log(`  ✓ ${key}`);
  } else {
    console.log(`  ✗ ${key} — MISSING (required)`);
    allOk = false;
  }
}

console.log('');
console.log('Optional:');

for (const key of optional) {
  if (process.env[key]) {
    console.log(`  ✓ ${key}`);
  } else {
    console.log(`  ~ ${key} — not set (some features unavailable)`);
  }
}

console.log('');

if (!allOk) {
  console.error('Environment check FAILED.');
  console.error('');
  console.error('Fix:');
  console.error('  1. Copy .env.example to .env.local');
  console.error('  2. Fill in JWT_SECRET. Set STORAGE_MODE=postgres and DATABASE_URL only when using PostgreSQL.');
  console.error('  3. Re-run: npm run local:check');
  console.error('');
  process.exit(1);
}

console.log('✓ Environment check passed. You can run npm run dev or npm run start.');
console.log('');
