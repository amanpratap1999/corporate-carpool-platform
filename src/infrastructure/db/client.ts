import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import { drizzle as drizzlePg, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle as drizzlePglite, PgliteDatabase } from 'drizzle-orm/pglite';
import { PGlite } from '@electric-sql/pglite';
import * as schema from './schema';

export type AppDatabase = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

const globalForDb = globalThis as unknown as {
  poolInstance?: Pool | null;
  pgliteInstance?: PGlite | null;
  dbInstance?: any;
};

export function isPgliteUrl(url?: string): boolean {
  if (!url) return false;
  return url.startsWith('pglite://') || url.startsWith('memory://');
}

export function getPglite(): PGlite | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || !isPgliteUrl(connectionString)) {
    return null;
  }

  if (!globalForDb.pgliteInstance) {
    const pglitePath = connectionString.replace(/^pglite:\/\//, '').replace(/^memory:\/\//, '');
    if (pglitePath && pglitePath !== 'memory') {
      const resolvedDir = path.resolve(process.cwd(), pglitePath);
      fs.mkdirSync(resolvedDir, { recursive: true });
      globalForDb.pgliteInstance = new PGlite(resolvedDir);
    } else {
      globalForDb.pgliteInstance = new PGlite();
    }
  }

  return globalForDb.pgliteInstance;
}

export function getDatabasePool(): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString || isPgliteUrl(connectionString)) {
    return null;
  }

  if (!globalForDb.poolInstance) {
    globalForDb.poolInstance = new Pool({
      connectionString,
      max: parseInt(process.env.DB_POOL_MAX || '20', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    globalForDb.poolInstance.on('error', (err) => {
      console.error('Unexpected error on idle PostgreSQL client:', err);
    });
  }

  return globalForDb.poolInstance;
}

export function getDb(): any {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;

  if (globalForDb.dbInstance) return globalForDb.dbInstance;

  if (isPgliteUrl(connectionString)) {
    const pglite = getPglite();
    if (!pglite) return null;
    globalForDb.dbInstance = drizzlePglite(pglite, { schema });
    return globalForDb.dbInstance;
  }

  const pool = getDatabasePool();
  if (!pool) return null;

  globalForDb.dbInstance = drizzlePg(pool, { schema });
  return globalForDb.dbInstance;
}

export async function checkDatabaseHealth(): Promise<{
  connected: boolean;
  latencyMs?: number;
  error?: string;
}> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return { connected: false, error: 'DATABASE_URL environment variable is not configured.' };
  }

  const start = Date.now();
  if (isPgliteUrl(connectionString)) {
    try {
      const pglite = getPglite();
      if (!pglite) return { connected: false, error: 'Failed to initialize PGlite.' };
      await pglite.query('SELECT 1');
      return { connected: true, latencyMs: Date.now() - start };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown database connection error';
      return { connected: false, error: msg };
    }
  }

  const pool = getDatabasePool();
  if (!pool) {
    return { connected: false, error: 'DATABASE_URL environment variable is not configured.' };
  }

  try {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      return { connected: true, latencyMs: Date.now() - start };
    } finally {
      client.release();
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown database connection error';
    return { connected: false, error: msg };
  }
}

/**
 * Executes a callback within a strict transactional boundary
 * using Drizzle ORM transactions.
 */
export async function withTransaction<T>(
  callback: (tx: any) => Promise<T>
): Promise<T> {
  const db = getDb();
  if (!db) {
    throw new Error('Database is not configured.');
  }

  return await db.transaction(async (tx: any) => {
    return await callback(tx);
  });
}

export async function closeDatabase(): Promise<void> {
  if (globalForDb.poolInstance) {
    await globalForDb.poolInstance.end();
    globalForDb.poolInstance = null;
  }
  if (globalForDb.pgliteInstance) {
    await globalForDb.pgliteInstance.close();
    globalForDb.pgliteInstance = null;
  }
  globalForDb.dbInstance = null;
}
