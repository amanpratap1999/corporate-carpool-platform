#!/usr/bin/env node
/**
 * db-migrate.mjs — Run all SQL migrations in order against DATABASE_URL
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npm run db:migrate
 *
 * This script runs the Drizzle migrator using the migrations/ directory.
 * It is idempotent — re-running it is safe.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

if (typeof process.loadEnvFile === 'function') {
  if (existsSync(join(repoRoot, '.env.local'))) {
    process.loadEnvFile(join(repoRoot, '.env.local'));
  } else if (existsSync(join(repoRoot, '.env'))) {
    process.loadEnvFile(join(repoRoot, '.env'));
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('');
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  console.error('');
  console.error('Set it in .env.local or pass it directly:');
  console.error('  DATABASE_URL=postgresql://user:pass@host:5432/db npm run db:migrate');
  console.error('');
  process.exit(1);
}

const migrationsFolder = join(repoRoot, 'migrations');
if (!existsSync(migrationsFolder)) {
  console.error('ERROR: migrations/ directory not found at', migrationsFolder);
  process.exit(1);
}

if (dbUrl.startsWith('pglite://') || dbUrl.startsWith('memory://')) {
  try {
    const pglitePath = dbUrl.replace(/^pglite:\/\//, '').replace(/^memory:\/\//, '');
    const { PGlite } = await import('@electric-sql/pglite');

    let client;
    if (pglitePath && pglitePath !== 'memory') {
      const resolvedDir = resolve(repoRoot, pglitePath);
      const fs = await import('fs');
      fs.mkdirSync(resolvedDir, { recursive: true });
      client = new PGlite(resolvedDir);
    } else {
      client = new PGlite();
    }

    console.log('Connecting to embedded PGlite database...');
    console.log('Running migrations from:', migrationsFolder);

    await client.exec(`
      CREATE SCHEMA IF NOT EXISTS "drizzle";
      CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at numeric
      );
    `);

    const appliedRows = await client.query(
      'SELECT created_at FROM "drizzle"."__drizzle_migrations" ORDER BY created_at DESC LIMIT 1'
    );
    const lastApplied = appliedRows.rows.length > 0 ? Number(appliedRows.rows[0].created_at) : 0;

    const journalPath = join(migrationsFolder, 'meta', '_journal.json');
    let migrationEntries = [];
    if (existsSync(journalPath)) {
      const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
      migrationEntries = journal.entries;
    } else {
      const files = readdirSync(migrationsFolder).filter(f => f.endsWith('.sql')).sort();
      migrationEntries = files.map((f, idx) => ({
        idx,
        tag: f.replace(/\.sql$/, ''),
        when: idx + 1,
      }));
    }

    let appliedCount = 0;
    for (const entry of migrationEntries) {
      if (Number(entry.when) > lastApplied) {
        const filePath = join(migrationsFolder, `${entry.tag}.sql`);
        if (existsSync(filePath)) {
          console.log(`  Applying: ${entry.tag}.sql`);
          let sqlContent = readFileSync(filePath, 'utf8');
          // Strip CREATE EXTENSION if present (built-in in PGlite)
          sqlContent = sqlContent.replace(/CREATE EXTENSION[^\n;]+;/gi, '-- $&');
          await client.exec(sqlContent);
          await client.query(
            'INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
            [entry.tag, entry.when]
          );
          appliedCount++;
        }
      }
    }

    await client.close();
    console.log('');
    console.log(`✓ Migrations completed successfully (${appliedCount} applied)`);
    process.exit(0);
  } catch (err) {
    console.error('');
    console.error('Migration failed:', err.message);
    if (err.cause) console.error(err.cause);
    console.error('');
    process.exit(1);
  }
}

try {
  const pg = await import('pg');
  const Pool = pg.default?.Pool ?? pg.Pool;
  const { drizzle } = await import('drizzle-orm/node-postgres');
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');

  const pool = new Pool({
    connectionString: dbUrl,
    connectionTimeoutMillis: 10000,
  });

  console.log('Connecting to database...');
  const db = drizzle(pool);

  console.log('Running migrations from:', migrationsFolder);
  await migrate(db, { migrationsFolder });

  console.log('');
  console.log('✓ Migrations completed successfully');
  await pool.end();
} catch (err) {
  console.error('');
  console.error('Migration failed:', err.message);
  if (err.code === 'ECONNREFUSED') {
    console.error('');
    console.error('Could not connect to PostgreSQL. Check that:');
    console.error('  1. PostgreSQL is running');
    console.error('  2. DATABASE_URL is correct');
    console.error('  3. The database exists');
  }
  console.error('');
  process.exit(1);
}
