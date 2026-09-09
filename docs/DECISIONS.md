# Architecture Decision Records (ADRs)

This document records the foundational architectural decisions made for the Corporate Carpooling Platform. Each record details context, decision, consequences, and future upgrade triggers.

---

## ADR-001: Relational PostgreSQL + PostGIS over Document / NoSQL Datastore

### Context
A carpooling platform requires strict ACID transactions (especially for atomic seat allocation), relational integrity across users, vehicles, and rides, and advanced spatial distance calculations for route corridor matching.

### Decision
Adopt **PostgreSQL (v15+) with PostGIS primitives** as the single primary datastore.

### Consequences
- **Positive**:
  - Native spatial indexes (`GIST`) enable instant bounding box and corridor distance filtering (`ST_DWithin`).
  - Strong transactional guarantees prevent seat over-allocation and orphan records.
  - Foreign key constraints maintain relational consistency.
- **Negative**:
  - Horizontal scaling requires connection pooling (PgBouncer) and read replicas rather than sharding out-of-the-box.
- **Future Upgrade Trigger**: When read traffic exceeds 20,000 queries/sec or historical ride telemetry exceeds 10TB, introduce read replicas and timescale partitioning for audit/telemetry logs.

---

## ADR-002: Structured Waypoint Decomposition vs. Opaque Polyline

### Context
Mapping engines (Google Maps, Mapbox, OSRM) typically return an encoded polyline string (e.g. `_p~iF~ps|U_ulLnnqC_mqN...`). Storing only this string on the `rides` table makes it impossible to perform performant SQL queries to find if a route passes near a passenger's pickup location without loading and decoding all polylines in application memory.

### Decision
Decompose the route into a parent `ride_routes` entity and an ordered child table `route_waypoints` storing discrete, indexed `latitude` and `longitude` pairs and arrival offset times.

### Consequences
- **Positive**:
  - Enables database-native corridor proximity search with simple B-Tree or PostGIS spatial indexes.
  - Supports future AI matching and dynamic waypoints without schema alterations.
  - Opaque overview polyline is still retained optionally for frontend rendering efficiency.
- **Negative**:
  - Slightly higher row count in the relational store (~5 to 15 waypoints per route).
- **Future Upgrade Trigger**: If waypoints exceed 100 million rows, partition `route_waypoints` by `organization_id` or date range.

---

## ADR-003: Decoupling Commuter Pickup/Drop Points from the Ride Entity

### Context
A common shortcut in MVP carpooling schemas is adding `passenger_pickup_address` and `passenger_drop_address` as nullable columns or an embedded array directly on the `rides` table.

### Decision
Strictly isolate passenger boarding coordinates into separate `pickup_points` and `drop_points` tables, referenced exclusively through the `ride_requests` table.

### Consequences
- **Positive**:
  - Allows multiple passengers to request distinct pickup and drop points along the same route.
  - Protects the immutable definition of the driver's base journey.
  - Enables passengers to reuse saved locations without polluting ride history.
  - Rejection or cancellation of a passenger request leaves the parent ride state clean and untouched.
- **Negative**:
  - Requires relational joins (`ride_requests` -> `pickup_points`, `drop_points`) when rendering the driver's passenger manifest.
- **Future Upgrade Trigger**: None. This is a fundamental domain boundary.

---

## ADR-004: Tenant Boundary Isolation (`organization_id` Everywhere) in Single-Tenant V1

### Context
V1 is being deployed for a single corporate pilot. Many teams omit `organization_id` from operational tables in V1, planning to "add it later" via migrations. In practice, retrofitting tenant isolation across millions of rows causes massive table locks, broken indexes, and code regressions.

### Decision
Include a non-nullable `organization_id UUID REFERENCES organizations(id)` column on **every** operational entity from Day 1 (`users`, `vehicles`, `rides`, `ride_routes`, `ride_requests`, `notifications`, `audit_logs`).

### Consequences
- **Positive**:
  - The database is 100% multi-tenant ready from the first commit.
  - Multi-tenant expansion requires zero DDL migrations.
  - Data leaks between corporate clients are structurally prevented by compound unique constraints (e.g., `UNIQUE(organization_id, license_plate)`).
- **Negative**:
  - Single-tenant queries must carry the `organization_id` predicate.
- **Future Upgrade Trigger**: When tenant count exceeds 100 enterprise organizations with strict data residency laws, support schema-per-tenant or database-per-tenant routing using the existing `organization_id` metadata.

---

## ADR-005: Concurrency Safety via Pessimistic Row Locks and DB Constraints

### Context
When multiple riders request seats on a ride with limited capacity, concurrent driver approvals or auto-confirmations could decrement available seats below zero (race condition).

### Decision
Combine two layers of defense:
1. Application layer: `SELECT ... FOR UPDATE` row lock on `rides` inside a database transaction during seat reservation.
2. Persistence layer: Hard check constraint `CHECK (available_seats >= 0)` on the `rides` table.

### Consequences
- **Positive**:
  - Mathematically impossible to over-allocate vehicle seats.
  - Protects against distributed race conditions across multiple server instances.
- **Negative**:
  - Short row-level database lock during approval (duration: ~2-5ms).
- **Future Upgrade Trigger**: If lock contention becomes an issue due to thousands of simultaneous bookings per second on a single ride, transition to Redis token bucket reservations with queue-based worker finalization.

---

## ADR-006: Dual Explicit Finite State Machines (Ride and RideRequest)

### Context
Car-pooling workflows have interdependent lifecycles (e.g., if a driver cancels a ride, what happens to 3 accepted riders and 2 pending requests?). Implicit boolean flags (`is_active`, `is_cancelled`, `is_accepted`) lead to invalid transitional states.

### Decision
Implement two explicit, decoupled Finite State Machines (FSM) backed by database ENUMs:
- `ride_status`: `DRAFT` -> `SCHEDULED` -> `IN_PROGRESS` -> `COMPLETED` / `CANCELLED`
- `ride_request_status`: `PENDING` -> `ACCEPTED` / `REJECTED` / `CANCELLED` / `EXPIRED`

Transitions are validated against strict transition tables before execution, and side-effects (e.g. restoring seats upon rider cancellation) are triggered atomically.

### Consequences
- **Positive**:
  - Clear domain contracts with zero ambiguous states.
  - Clear audit logging on every transition.
- **Negative**:
  - Every status change must pass through the state machine validation layer.
- **Future Upgrade Trigger**: None. This domain model scales cleanly to mobile and automated dispatch.

---

## ADR-007: Web-First Delivery with Mobile-Native Backward Compatibility

### Context
V1 requires web-only delivery, but native mobile applications (iOS/Android) are planned for Phase 3. If APIs are designed tightly coupled to web page layouts (e.g. returning HTML or monolithic dashboard view models), mobile clients will require an API rewrite.

### Decision
Implement a pure headless RESTful JSON API following OpenAPI specifications. The Web client (Next.js/React) acts as an ordinary API consumer, identical to how future React Native or Flutter mobile apps will consume the API.

### Consequences
- **Positive**:
  - Phase 3 mobile apps can reuse 100% of the backend endpoints.
  - Clear separation between UI presentation and domain business logic.
- **Negative**:
  - Requires disciplined API design with versioned contracts (`/api/v1`).
- **Future Upgrade Trigger**: In Phase 3, add a `user_push_tokens` table for mobile APNs/FCM delivery and WebSockets for real-time driver GPS tracking.

---

## ADR-008: Explicit User Capabilities Table vs. Monolithic Role Enum

### Context
Employees in a corporate carpool are not purely "Drivers" or "Riders"; an employee may ride on Monday and drive on Wednesday, while an office administrator might also offer rides.

### Decision
Separate identity (`users`) from capabilities (`user_capabilities`). A user possesses independent flags: `can_ride`, `can_drive`, and `is_org_admin`, along with verification timestamps (`driver_verified_at`).

### Consequences
- **Positive**:
  - Flexible persona switching without multiple accounts or profile duplication.
  - Seamless onboarding: all employees start with `can_ride = true` and unlock `can_drive = true` upon vehicle registration and verification.
- **Negative**:
  - Requires a 1-to-1 join to check permissions.
- **Future Upgrade Trigger**: None. Accommodates future role expansions (e.g., `is_fleet_manager`, `is_safety_officer`).
