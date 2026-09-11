/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  // Keep local/CI builds reliable on constrained Windows hosts.
  // This trades build parallelism for deterministic memory usage.
  generateBuildId: async () => 'production-build-' + Date.now(),
  experimental: {
    cpus: 1,
  },
};

const storageMode = (process.env.STORAGE_MODE ||
  (process.env.NODE_ENV === 'production' ? 'postgres' : 'memory')).toLowerCase();

const isRuntimeStart = process.env.npm_lifecycle_event === 'start';

if (isRuntimeStart && (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'staging') && storageMode !== 'postgres') {
  throw new Error('FATAL: Staging and production require STORAGE_MODE=postgres.');
}

if (isRuntimeStart && (process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'staging') && !process.env.DATABASE_URL) {
  throw new Error('FATAL: DATABASE_URL is missing. Configure PostgreSQL before starting staging/production.');
}

module.exports = nextConfig;
