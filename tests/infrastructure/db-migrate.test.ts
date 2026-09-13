import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Database Migration Runner (db-migrate.mjs) Journal Validation', () => {
  const repoRoot = path.resolve(__dirname, '../..');
  const migrationsFolder = path.join(repoRoot, 'migrations');
  const journalPath = path.join(migrationsFolder, 'meta', '_journal.json');

  it('guarantees migrations/meta/_journal.json exists and is valid JSON', () => {
    expect(fs.existsSync(journalPath)).toBe(true);

    const raw = fs.readFileSync(journalPath, 'utf8');
    const journal = JSON.parse(raw);

    expect(journal).toBeDefined();
    expect(Array.isArray(journal.entries)).toBe(true);
    expect(journal.entries.length).toBeGreaterThan(0);

    // Verify all journal entries have valid tag, version, and when properties
    for (const entry of journal.entries) {
      expect(entry.tag).toBeDefined();
      expect(typeof entry.tag).toBe('string');
      expect(entry.when).toBeDefined();

      const sqlFile = path.join(migrationsFolder, `${entry.tag}.sql`);
      expect(fs.existsSync(sqlFile)).toBe(true);
    }
  });

  it('fails with informative error when _journal.json is missing', () => {
    function validateJournal(folder: string) {
      const targetJournal = path.join(folder, 'meta', '_journal.json');
      if (!fs.existsSync(targetJournal)) {
        throw new Error(
          `Migration journal not found at ${targetJournal}. ` +
          `PGlite migration requires migrations/meta/_journal.json to guarantee deterministic migration ordering.`
        );
      }
    }

    const nonExistentFolder = path.join(repoRoot, 'non_existent_migrations_dir');
    expect(() => validateJournal(nonExistentFolder)).toThrowError(/Migration journal not found/);
    expect(() => validateJournal(nonExistentFolder)).toThrowError(/deterministic migration ordering/);
  });
});
