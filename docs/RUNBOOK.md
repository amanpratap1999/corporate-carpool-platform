# Corporate Carpooling Platform — Runbook

This runbook covers local development setup and Docker deployment on Windows (PowerShell) and macOS/Linux.

---

## Quick Start

### Prerequisites

| Tool | Minimum version | Install |
|------|----------------|---------|
| Node.js | 20 LTS | https://nodejs.org |
| npm | 10+ | Bundled with Node.js |
| PostgreSQL | 15+ | Only required for PostgreSQL mode |
| Docker (optional) | 24+ | https://docs.docker.com/desktop/windows/ |

---

## Local Development Mode

### 1. Clone and install

```powershell
git clone <repo-url>
cd bold-volta
npm ci
```

### 2. Set up environment

```powershell
Copy-Item .env.example .env.local
```

Open `.env.local`. For normal local development, use the in-memory store:

```env
STORAGE_MODE=memory
JWT_SECRET=<random-secret-at-least-32-characters>
```

Data in this mode is intentionally non-persistent and resets when the dev server restarts. Fill in:

| Variable | Required | Description |
|----------|----------|-------------|
| `STORAGE_MODE` | ✅ | `memory` for local development; `postgres` for PostgreSQL |
| `DATABASE_URL` | Only in PostgreSQL mode | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | Random secret ≥ 64 chars |
| `GOOGLE_MAPS_API_KEY` | ⚠️ | Required for routing features |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | ⚠️ | Required for map rendering |
| `CRON_SECRET` | ⚠️ | Required for expiration worker |

Generate secrets:
```powershell
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Optional PostgreSQL Setup

Skip this section when using `STORAGE_MODE=memory`.

#### Standalone PostgreSQL Server

Open `psql` as the postgres superuser:
```powershell
psql -U postgres
```

Then run:
```sql
CREATE USER carpool WITH PASSWORD 'changeme';
CREATE DATABASE carpool_db OWNER carpool;
GRANT ALL PRIVILEGES ON DATABASE carpool_db TO carpool;
\q
```

Set `DATABASE_URL` in `.env.local`:
```
DATABASE_URL=postgresql://carpool:changeme@localhost:5432/carpool_db
SEED_ADMIN_PASSWORD=ComplexAdminPass123!
```

### 4. Validate environment

```powershell
npm run local:check
```

This checks the selected storage mode. In memory mode it does not require PostgreSQL.

### 5. Check database connectivity (PostgreSQL mode only)

```powershell
npm run db:check
```

### 6. Run migrations (PostgreSQL mode only)

```powershell
npm run db:migrate
```

This creates all database tables from the `migrations/` directory.
Safe to re-run — all migrations are idempotent.

### 7. Start development server

```powershell
npm run dev
```

App is now available at: http://localhost:3000

**PostgreSQL mode:** Run `npm run db:seed` after migrations and set `SEED_ADMIN_PASSWORD`.
**Memory mode:** The repository is an empty in-memory development store unless your development/test fixture seeds it; data is not retained across restarts. Use PostgreSQL mode plus `npm run db:seed` when you need persistent login accounts.
The application redirects unauthenticated users to `/login`.

### 8. Production-like local run

```powershell
npm run build
npm run start
```

---

## Docker Mode

### 1. Set up environment

```powershell
Copy-Item .env.example .env
```

Edit `.env` and fill in ALL required values. For Docker, set:

```
DATABASE_URL=postgresql://carpool:yourpass@postgres:5432/carpool_db
POSTGRES_USER=carpool
POSTGRES_PASSWORD=yourpass
POSTGRES_DB=carpool_db
JWT_SECRET=<64-char random>
CRON_SECRET=<32-char random>
```

### 2. Start all services

```powershell
docker compose up --build
```

**What happens automatically:**
1. PostgreSQL container starts and waits until healthy
2. `migrate` service runs all migrations
3. `web` service starts (depends on migrate completing)
4. `worker` service starts (depends on web being healthy)

### 3. Verify deployment

```powershell
npm run staging:verify
```

Or check manually:
```powershell
Invoke-WebRequest http://localhost:3000/api/v1/health | Select-Object -ExpandProperty Content
```

### 4. Stop services

```powershell
docker compose down         # stop containers, keep data
docker compose down -v      # stop containers AND delete database volume
```

---

## Database Scripts Reference

| Command | Description |
|---------|-------------|
| `npm run db:check` | Test database connectivity |
| `npm run db:migrate` | Run all pending migrations |
| `npm run db:seed` | Trigger seed data (requires server to be running) |
| `npm run db:reset` | **DESTRUCTIVE** — drop all tables and re-migrate (local only) |
| `npm run local:check` | Validate environment variables |
| `npm run staging:verify` | Smoke-test a running staging instance |

---

## Troubleshooting

### "DATABASE_URL is not set"
This is expected in local memory mode. Set `STORAGE_MODE=memory` for development, or set `STORAGE_MODE=postgres` and provide a valid PostgreSQL URL when you want persistent local data.

### "Could not connect to database" on Windows
1. Check PostgreSQL service is running: `Get-Service -Name postgresql*`
2. Start it: `Start-Service postgresql-x64-15`
3. Verify `DATABASE_URL` host/port match your PostgreSQL installation

### Login fails with 401
The login requires an account with a set password. On a fresh database, no accounts exist.
Create an admin account via direct database insert or by implementing the first-admin bootstrap flow.

### "Migration failed: relation already exists"
All migrations use `IF NOT EXISTS` / `DO $$ BEGIN ... EXCEPTION` guards and are idempotent.
If you see this error, the migration file may be partially corrupted — run `npm run db:reset` (local only) to start fresh.

### Docker: "POSTGRES_PASSWORD is required"
Set `POSTGRES_PASSWORD` in your `.env` file. It cannot be empty.

### Docker: `service_completed_successfully` not supported
Upgrade Docker Compose to v2.x: `docker compose version`

### Build error: "Cannot find module '@/lib/auth-client'"
Run `npm ci` to install all dependencies fresh.

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `STORAGE_MODE` | Yes | `memory` locally | `memory` or `postgres` |
| `DATABASE_URL` | PostgreSQL mode only | — | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | — | JWT signing secret (min 32 chars) |
| `GOOGLE_MAPS_API_KEY` | ⚠️ | — | Server key for Directions + Places APIs |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | ⚠️ | — | Browser key for Maps JavaScript API |
| `CRON_SECRET` | ⚠️ | — | Auth token for cron expiration worker |
| `POSTGRES_USER` | Docker | `carpool` | PostgreSQL username for Docker |
| `POSTGRES_PASSWORD` | Docker | — | PostgreSQL password for Docker |
| `POSTGRES_DB` | Docker | `carpool_db` | PostgreSQL database name for Docker |
| `NEXT_PUBLIC_APP_URL` | No | `http://localhost:3000` | Public app URL |
| `DB_POOL_MAX` | No | `20` | Max database connection pool size |

---

## Migration History

| File | Description |
|------|-------------|
| `0000_gorgeous_killraven.sql` | Auto-generated base schema (Drizzle) |
| `0001_initial_schema.sql` | Canonical initial schema with all enums and tables |
| `0001_rare_cerebro.sql` | Unique index for ride_requests |
| `0002_security_columns.sql` | Auth columns: password_hash, invitation_token |
| `0003_multimodal_vehicles.sql` | vehicle_type enum, motorcycle support |
| `0004_routing_enhancements.sql` | Google Maps place_id, polyline storage |
| `0005_rename_fields.sql` | Idempotent column renames (seats_allocated→seats_booked, etc.) |
| `0006_invitation_token_expires.sql` | Ensure invitation_token_expires_at exists |
| `0007_check_constraints.sql` | DB-level check constraints for seat bounds |

All migrations are idempotent and safe to re-run.
