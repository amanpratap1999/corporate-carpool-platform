#!/usr/bin/env node
/** Idempotent local-development seed for the canonical PostgreSQL schema. */

import fs from 'node:fs';
import crypto from 'node:crypto';

if (typeof process.loadEnvFile === 'function') {
  if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
  else if (fs.existsSync('.env')) process.loadEnvFile('.env');
}

const dbUrl = process.env.DATABASE_URL;
const seedPassword = process.env.SEED_ADMIN_PASSWORD || 'CarpoolAdmin2026!';
if (!dbUrl) {
  console.error('✗ DATABASE_URL is not set.');
  process.exit(1);
}

function createPasswordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64);
  return `${salt}:${derivedKey.toString('hex')}`;
}

async function executeSeed(client) {
  await client.query('BEGIN');
  try {
    await client.query(`
      INSERT INTO organizations
        (id, name, slug, allowed_email_domains, settings, is_active, created_at, updated_at)
      VALUES
        ('11111111-1111-4111-8111-111111111111', 'Acme Corp', 'acme-corp',
         ARRAY['@acme.com', '@acme.corp'], '{}'::jsonb, true, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        allowed_email_domains = EXCLUDED.allowed_email_domains,
        updated_at = NOW()
    `);
    await client.query(`
      INSERT INTO users
        (id, organization_id, email, full_name, status, password_hash, created_at, updated_at)
      VALUES
        ('22222222-2222-4222-8222-222222222222',
         '11111111-1111-4111-8111-111111111111',
         'admin@acme.com', 'Admin User', 'ACTIVE', $1, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        full_name = EXCLUDED.full_name,
        status = 'ACTIVE',
        password_hash = EXCLUDED.password_hash,
        updated_at = NOW()
    `, [createPasswordHash(seedPassword)]);
    await client.query(`
      INSERT INTO user_capabilities
        (id, user_id, organization_id, can_ride, can_drive, is_org_admin, created_at, updated_at)
      VALUES
        ('22222222-2222-4222-8222-222222222222',
         '22222222-2222-4222-8222-222222222222',
         '11111111-1111-4111-8111-111111111111', true, true, true, NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE SET
        can_ride = true,
        can_drive = true,
        is_org_admin = true,
        updated_at = NOW()
    `);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

try {
  if (dbUrl.startsWith('pglite://') || dbUrl.startsWith('memory://')) {
    const path = await import('node:path');
    const { PGlite } = await import('@electric-sql/pglite');
    const pglitePath = dbUrl.replace(/^pglite:\/\//, '').replace(/^memory:\/\//, '');
    const resolvedPath = pglitePath && pglitePath !== 'memory' ? path.resolve(process.cwd(), pglitePath) : undefined;
    const client = resolvedPath ? new PGlite(resolvedPath) : new PGlite();
    try {
      await executeSeed(client);
      console.log('✓ Database seeded successfully.');
      console.log('  Admin user: admin@acme.com');
      console.log(`  Password: ${seedPassword}`);
    } finally {
      await client.close();
    }
  } else {
    const pg = await import('pg');
    const Pool = pg.default?.Pool ?? pg.Pool;
    const pool = new Pool({ connectionString: dbUrl, connectionTimeoutMillis: 5000 });
    const client = await pool.connect();
    try {
      await executeSeed(client);
      console.log('✓ Database seeded successfully.');
      console.log('  Admin user: admin@acme.com');
      console.log('  Password: supplied through SEED_ADMIN_PASSWORD');
    } finally {
      client.release();
      await pool.end();
    }
  }
} catch (error) {
  console.error('✗ Seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
