/**
 * Repository Factory
 *
 * Local development defaults to the in-memory repository. Set
 * STORAGE_MODE=postgres to opt into PostgreSQL locally.
 *
 * Staging and production are PostgreSQL-only and fail closed.
 */

import { IDataRepository } from './repository.interface';
import { PostgresStore } from './postgres-store';
import { DataStore } from './data-store';

const globalForRepo = globalThis as unknown as {
  repositoryInstance?: IDataRepository | null;
};

export function getRepository(): IDataRepository {
  if (globalForRepo.repositoryInstance) return globalForRepo.repositoryInstance;

  const mode = (process.env.STORAGE_MODE ||
    (process.env.NODE_ENV === 'production' ? 'postgres' : 'memory')).toLowerCase();
  const deployed = process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'staging';

  if (mode === 'memory') {
    if (deployed) {
      throw new Error(
        'FATAL: STORAGE_MODE=memory is not allowed in staging or production. ' +
        'Set STORAGE_MODE=postgres and provide DATABASE_URL.'
      );
    }
    globalForRepo.repositoryInstance = DataStore.getInstance();
  } else if (mode === 'postgres') {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        'FATAL: STORAGE_MODE=postgres requires DATABASE_URL. ' +
        'Use STORAGE_MODE=memory for local development without PostgreSQL.'
      );
    }
    globalForRepo.repositoryInstance = PostgresStore.getInstance();
  } else {
    throw new Error(`FATAL: Unsupported STORAGE_MODE "${mode}". Use "memory" or "postgres".`);
  }

  return globalForRepo.repositoryInstance!;
}

/**
 * Override the active repository. Used in tests to inject a
 * fresh DataStore instance without a DATABASE_URL.
 */
export function setRepository(repo: IDataRepository | null): void {
  globalForRepo.repositoryInstance = repo;
}
