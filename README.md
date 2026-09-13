# Corporate Carpooling Platform

A multi-tenant corporate carpooling and commuter coordination system designed for enterprise organizations. It features route corridor matching, seat booking workflows, calendar-aware departure scheduling, and role-based access control with tenant isolation.

---

## Key Features

- **Multi-Tenant Isolation**: Complete data segregation by corporate organization with domain-verified onboarding.
- **Corridor & Detour Matching**: Haversine and perpendicular route projection algorithms match passengers within allowable detour thresholds without compromising driver trip integrity.
- **Transactional State Machine**: Pessimistic row-level locking (`SELECT ... FOR UPDATE`) prevents overbooking and race conditions during simultaneous seat booking requests and cancellations.
- **Enterprise Security**: HS256 JWT authentication, scrypt password hashing with unique salt, timing-safe credential verification, and functional indexing on email lookups.
- **Shared Distributed Rate Limiting**: Sliding-window rate limiting backed by PostgreSQL with local in-memory fallback.
- **Dual Execution Modes**: Embedded local execution via PGlite / in-memory mode and production-ready containerized PostgreSQL with Docker Compose.
- **Google Maps Integration**: Route directions and Places autocomplete with server-side proxying and an in-memory LRU cache to optimize upstream API usage.

---

## Quickstart

### Prerequisites

- Node.js 20+
- npm 10+
- (Optional) Docker and Docker Compose

### Local Development (Quickstart with PGlite)

1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```

3. Run migrations and start the development server:
   ```bash
   npm run db:migrate
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

### Docker Deployment

To build and run the production stack with PostgreSQL, migration runner, web app, and background worker:

```bash
docker compose up --build
```

---

## Documentation

Comprehensive architecture, schema, and API specifications are maintained under [`docs/`](docs/):

- [`ARCHITECTURE.md`](docs/ARCHITECTURE.md): System architecture, execution modes, and component layout.
- [`DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md): Entity definitions, check constraints, and migration journal.
- [`API_CONTRACT.md`](docs/API_CONTRACT.md): REST API endpoints, request schemas, and error responses.
- [`RUNBOOK.md`](docs/RUNBOOK.md): Operational runbook and deployment guidelines.
- [`USER_FLOWS.md`](docs/USER_FLOWS.md): Ride hosting, booking, approval, and cancellation lifecycles.

---

## License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
