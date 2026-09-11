#!/usr/bin/env node
/**
 * db-reset.mjs — Drop all tables and re-run migrations (DESTRUCTIVE — dev only)
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npm run db:reset
 *
 * WARNING: This destroys all data. Never run in production.
 */

import fs from 'node:fs';

if (typeof process.loadEnvFile === 'function') {
  if (fs.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  } else if (fs.existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('ERROR: DATABASE_URL is not set');
  process.exit(1);
}

if (process.env.NODE_ENV === 'production') {
  console.error('ERROR: db:reset is FORBIDDEN in NODE_ENV=production');
  process.exit(1);
}

// Require explicit confirmation for non-test environments
if (
  !process.env.FORCE_RESET &&
  !dbUrl.startsWith('pglite://') &&
  !dbUrl.startsWith('memory://') &&
  !dbUrl.includes('localhost') &&
  !dbUrl.includes('127.0.0.1')
) {
  console.error('');
  console.error('WARNING: DATABASE_URL does not point to localhost.');
  console.error('Refusing to reset a remote database without FORCE_RESET=1.');
  console.error('');
  console.error('If you really want to reset this database:');
  console.error('  FORCE_RESET=1 npm run db:reset');
  console.error('');
  process.exit(1);
}

if (dbUrl.startsWith('pglite://') || dbUrl.startsWith('memory://')) {
  try {
    const pglitePath = dbUrl.replace(/^pglite:\/\//, '').replace(/^memory:\/\//, '');
    const { PGlite } = await import('@electric-sql/pglite');
    const client = pglitePath && pglitePath !== 'memory' ? new PGlite(pglitePath) : new PGlite();
    console.log('Dropping and recreating schema in PGlite...');
    await client.exec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;');
    await client.close();
    console.log('✓ Schema reset');

    const { execSync } = await import('child_process');
    console.log('Running migrations...');
    execSync('node scripts/db-migrate.mjs', { stdio: 'inherit', env: process.env });

    console.log('');
    console.log('✓ Database reset complete');
    process.exit(0);
  } catch (err) {
    console.error('Reset failed:', err.message);
    process.exit(1);
  }
}

try {
  const pg = await import('pg');
  const Pool = pg.default?.Pool ?? pg.Pool;

  const pool = new Pool({ connectionString: dbUrl });
  const client = await pool.connect();

  console.log('Dropping and recreating schema...');
  await client.query('DROP SCHEMA public CASCADE');
  await client.query('CREATE SCHEMA public');
  await client.query('GRANT ALL ON SCHEMA public TO PUBLIC');
  console.log('✓ Schema reset');

  client.release();
  await pool.end();

  // Re-run migrations
  const { execSync } = await import('child_process');
  console.log('Running migrations...');
  execSync('node scripts/db-migrate.mjs', { stdio: 'inherit', env: process.env });

  console.log('');
  console.log('✓ Database reset complete');
} catch (err) {
  console.error('Reset failed:', err.message);
  process.exit(1);
}
