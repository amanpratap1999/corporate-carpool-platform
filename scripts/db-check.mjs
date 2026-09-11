#!/usr/bin/env node
/**
 * db-check.mjs — Check DATABASE_URL connectivity
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npm run db:check
 *   # or with .env.local loaded:
 *   npm run db:check
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
  console.error('');
  console.error('✗ DATABASE_URL is not set.');
  console.error('  Create .env.local from .env.example and set DATABASE_URL.');
  console.error('');
  process.exit(1);
}

console.log('Checking database connectivity...');

if (dbUrl.startsWith('pglite://') || dbUrl.startsWith('memory://')) {
  try {
    const pglitePath = dbUrl.replace(/^pglite:\/\//, '').replace(/^memory:\/\//, '');
    const { PGlite } = await import('@electric-sql/pglite');
    const client = pglitePath && pglitePath !== 'memory' ? new PGlite(pglitePath) : new PGlite();
    const result = await client.query('SELECT version(), current_database() as db');
    const { version, db } = result.rows[0];
    await client.close();

    console.log('');
    console.log('✓ Database connection OK (PGlite embedded)');
    console.log('  Database :', db);
    console.log('  Server   :', version.split(' ').slice(0, 2).join(' '));
    console.log('  Storage  :', pglitePath || ':memory:');
    console.log('');
    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('✗ Database connection failed:', err.message);
    console.error('');
    process.exit(1);
  }
}

try {
  const pg = await import('pg');
  const Pool = pg.default?.Pool ?? pg.Pool;

  const pool = new Pool({
    connectionString: dbUrl,
    connectionTimeoutMillis: 5000,
    max: 1,
  });

  const client = await pool.connect();
  const result = await client.query('SELECT version(), current_database() as db');
  const { version, db } = result.rows[0];

  client.release();
  await pool.end();

  console.log('');
  console.log('✓ Database connection OK');
  console.log('  Database :', db);
  console.log('  Server   :', version.split(' ').slice(0, 2).join(' '));
  console.log('');
} catch (err) {
  console.error('');
  console.error('✗ Database connection failed:', err.message);
  console.error('');
  console.error('Common causes:');
  console.error('  - PostgreSQL is not running');
  console.error('  - DATABASE_URL host/port is wrong');
  console.error('  - Database or user does not exist');
  console.error('  - Password is incorrect');
  console.error('');
  process.exit(1);
}
