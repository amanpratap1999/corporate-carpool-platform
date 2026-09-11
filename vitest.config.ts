import { defineConfig } from 'vitest/config';
import path from 'path';
import fs from 'fs';

// Load .env.local into process.env if present for deterministic local test runs
if (typeof process.loadEnvFile === 'function') {
  const envLocal = path.resolve(__dirname, '.env.local');
  const envDefault = path.resolve(__dirname, '.env');
  if (fs.existsSync(envLocal)) {
    process.loadEnvFile(envLocal);
  } else if (fs.existsSync(envDefault)) {
    process.loadEnvFile(envDefault);
  }
}

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // Keep local and CI runs deterministic on constrained Windows hosts.
    // The suite is small and repository state is shared by several route tests.
    pool: 'forks',
    minWorkers: 1,
    maxWorkers: 1,
    fileParallelism: false,
  },
});
