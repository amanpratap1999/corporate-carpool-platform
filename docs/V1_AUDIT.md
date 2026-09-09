# Architecture & Product Audit: Corporate Carpooling Platform (V1 Web)

**Audit Date**: September 9, 2026  
**Auditor**: Principal System Architect  
**Review Target**: Architecture Foundation, Database Design, and V1 Web Implementation  
**Status**: AUDIT COMPLETE — GAPS & RISKS CATALOGUED  

---

## Executive Audit Verdict

The platform has established a high-integrity architectural baseline. The core domain modeling, explicit state machines, database DDL, and concurrency protections for atomic seat allocation represent senior-level systems design.

However, the current implementation is a **prototype/demonstration-grade foundation**:
1. **Routing is simulated**: There is **zero live Google Maps integration** (no Google Places Autocomplete, no Google Directions API, no dynamic polyline generation). The UI uses hardcoded geographic presets and SVG rendering.
2. **Authentication is simulated**: User identity relies entirely on client-supplied `X-User-Id` request headers with zero cryptographic verification, no session cookies, and no corporate SSO.
3. **Persistence is ephemeral**: Data is currently managed in an in-memory transactional singleton (`DataStore`), though the canonical PostgreSQL DDL is fully drafted.
4. **Vehicles lack multimodal support**: Schema enforces `total_seats >= 2`, which physically prevents motorcycle or two-wheeler carpooling.

---

## 1. Original Requirement

The platform requirements stipulated:
- **Scope**: Responsive Web Application only (mobile deferred to Phase 3).
- **Target Audience**: Corporate employees commuting between residential corridors and company campuses within verified organization boundaries.
- **Three Canonical Product Artifacts**: Roadmap, User Flow, System Overview.
- **Highest Priority Technical Artifact**: `docs/DATABASE_SCHEMA.md` with multi-tenant readiness, decoupled entities, explicit state machines, and structured geographic metadata.
- **Strict Entity Decoupling**: User $\ne$ Vehicle $\ne$ Ride $\ne$ Route $\ne$ Ride Request $\ne$ Pickup/Drop Points.
- **Concurrency Defenses**: Zero overbooking, atomic seat allocation, duplicate request prevention, and cancellation seat restoration.

---

## 2. Current Implementation Overview

The repository currently contains:
- **Architecture Suite**: 9 comprehensive documentation files and 6 canonical Mermaid diagrams in [`docs/`](file:///c:/Users/Prakhar%20Singh/Documents/antigravity/bold-volta/docs).
- **Domain Layer**: [`src/domain/types.ts`](file:///c:/Users/Prakhar%20Singh/Documents/antigravity/bold-volta/src/domain/types.ts), [`RideStateMachine`](file:///c:/Users/Prakhar%20Singh/Documents/antigravity/bold-volta/src/domain/state-machines/ride-state-machine.ts), and [`RideRequestStateMachine`](file:///c:/Users/Prakhar%20Singh/Documents/antigravity/bold-volta/src/domain/state-machines/ride-request-state-machine.ts).
- **Service Layer**: [`src/services/data-store.ts`](file:///c:/Users/Prakhar%20Singh/Documents/antigravity/bold-volta/src/services/data-store.ts) (In-memory data store with Haversine spatial calculations, corridor search, atomic seat locking, audit logging, and notifications), [`src/services/seed-data.ts`](file:///c:/Users/Prakhar%20Singh/Documents/antigravity/bold-volta/src/services/seed-data.ts).
- **API Transport**: 15 RESTful JSON API routes under [`src/app/api/v1/`](file:///c:/Users/Prakhar%20Singh/Documents/antigravity/bold-volta/src/app/api/v1).
- **Web UI**: Next.js 15 App Router interface featuring persona switching, corridor SVG visualizer, multi-tab layout, and audit inspection.
- **Automated Tests**: 16 unit and integration tests passing in Vitest (`npm test`).

---

## 3. Verified (Implemented, Tested, and Proven in Runtime)

- [x] **Entity Decoupling**: Commuter pickup/drop coordinates are strictly isolated in `pickup_points` and `drop_points`, referenced only by `ride_requests`. The driver's base journey (`rides`, `ride_routes`) is immutable to passenger requests.
- [x] **Dual Explicit State Machines**:
  - `RideStateMachine`: `DRAFT` &rarr; `SCHEDULED` &rarr; `IN_PROGRESS` &rarr; `COMPLETED` / `CANCELLED`.
  - `RideRequestStateMachine`: `PENDING` &rarr; `ACCEPTED` / `REJECTED` / `CANCELLED` / `EXPIRED` / `COMPLETED`.
  - Illegal transitions throw `InvalidStateTransitionError`.
- [x] **Atomic Seat Allocation & Double-Booking Prevention**:
  - Approving a request atomically checks `available_seats >= requested_seats` and decrements seats.
  - Attempting to book when 0 seats remain returns `HTTP 409 Conflict`.
- [x] **Cancellation Seat Restoration**:
  - Cancelling an `ACCEPTED` request restores seats back to the ride pool atomically.
  - Cancelling a `PENDING` request leaves seats untouched.
- [x] **Duplicate Request Prevention**:
  - A commuter with an active or pending request on a ride cannot submit another request (`HTTP 409 Conflict`).
- [x] **Driver Cascade Cancellation**:
  - When a driver cancels an active or scheduled ride, all linked pending and accepted requests transition to `CANCELLED` with audit logs and notifications.
- [x] **Haversine Corridor Proximity Search**:
  - Evaluates distance between commuter coordinates and ordered route waypoints within a 3,000m detour threshold.
- [x] **Append-Only Audit Ledger**:
  - Captures state transitions, actors, timestamps, and metadata.
- [x] **In-App Notification Feed**:
  - Dispatches alerts upon request submission, driver approval, rejection, trip departure, and cancellation.

---

## 4. Partially Implemented

- [~] **Geographic Route Modeling**:
  - *Implemented*: Schema decomposes routes into `ride_routes` and ordered `route_waypoints` with discrete bounding box coordinates.
  - *Gap*: Waypoints are currently hardcoded in UI forms and seed data; there is no dynamic geocoding or routing engine integration.
- [~] **Multi-Tenancy**:
  - *Implemented*: `organization_id` exists on all 13 tables, in DDL indexes, and in TypeScript interfaces.
  - *Gap*: The in-memory data store stores all orgs in a single global map without automated cryptographic tenant filtering middleware.
- [~] **Commuter Search Filtering**:
  - *Implemented*: Filters by origin/dest corridor distance, date, and seat count.
  - *Gap*: No time window filtering (`window_start` / `window_end`), and results are not sorted or ranked (e.g. by lowest detour or earliest departure).
- [~] **Vehicles & Capabilities**:
  - *Implemented*: Independent `user_capabilities` table (`can_ride`, `can_drive`, `is_org_admin`) and vehicle ownership.
  - *Gap*: Only four-wheeled vehicles with $\ge 2$ total seats are allowed. Two-wheelers/motorcycles are blocked by check constraints.

---

## 5. Not Implemented

- [ ] **Google Maps Integration**:
  - No Google Maps JavaScript SDK, Places Autocomplete API, or Directions API integration.
  - No dynamic place search, route preview, alternate route selection, or live polyline decoding.
- [ ] **Production Authentication & Session Management**:
  - No JWT generation/verification, no password hashing (bcrypt/argon2id), no corporate SSO (SAML 2.0 / OIDC), no secure HTTP-only cookies.
  - Relies entirely on spoofable `X-User-Id` request headers.
- [ ] **User Registration & Activation Workflow**:
  - No signup or invite-redemption endpoint. Users can only be provisioned via database seed scripts.
- [ ] **Live PostgreSQL Persistence**:
  - The application currently runs on an in-memory `DataStore`. The canonical PostgreSQL schema in `docs/DATABASE_SCHEMA.md` has not been wired via an active ORM (e.g. Drizzle/Kysely).
- [ ] **Background Ride Expiration Worker**:
  - No scheduled task/cron to transition `SCHEDULED` rides to `EXPIRED` or pending requests to `EXPIRED` when departure time passes.

---

## 6. Architectural Risk

1. **State Loss on Process Restart**:
   - Because all data is currently in-memory, server restarts reset all rides, requests, and vehicles to the initial seed state.
2. **Lack of Distributed Concurrency Locks**:
   - In-memory Node.js event loop serialization protects against races on a single Node instance, but deploying multiple web containers behind a load balancer will result in race conditions unless PostgreSQL row locks (`FOR UPDATE`) or Redis locks are actively engaged.
3. **Tight Coupling of Map Visualization to Static Coordinates**:
   - The SVG `CorridorMap` computes relative pixel offsets based on bounding boxes. Without real map tiles (Google Maps / Mapbox / OpenStreetMap), users cannot see actual road geometry, traffic, or real-world turnarounds.

---

## 7. Database Risk

1. **PostgreSQL ENUM Alteration Friction**:
   - Enums (`ride_status`, `ride_request_status`, `vehicle_status`) are modeled as native PostgreSQL ENUM types. In PostgreSQL, adding new enum values cannot be executed inside a multi-statement transaction block, complicating zero-downtime blue/green schema migrations.
2. **Lack of `vehicle_type` Column**:
   - `vehicles` has no type classifier (e.g. `SEDAN`, `SUV`, `MOTORCYCLE`, `VAN`). The hard constraint `CHECK (total_seats >= 2)` prevents registering a 1-passenger vehicle like a motorcycle or electric scooter.
3. **Bounding Box Redundancy**:
   - `ride_routes` contains both `bounding_box JSONB` and 4 discrete columns (`min_latitude`, `max_latitude`, `min_longitude`, `max_longitude`). In production, this can lead to data drift unless enforced by a trigger or generated columns.

---

## 8. Product / UX Gap

1. **Hardcoded Publish Form**:
   - In [`src/app/page.tsx`](file:///c:/Users/Prakhar%20Singh/Documents/antigravity/bold-volta/src/app/page.tsx), clicking "Publish New Ride" submits a predefined SF-to-Mountain-View route regardless of what the user types. Drivers cannot define arbitrary origin and destination addresses.
2. **Fixed Destination in Search**:
   - The Rider search interface hardcodes the destination to "Acme HQ Campus". Commuters cannot search for rides to satellite offices, transit hubs, or evening return trips home.
3. **No Interactive Seat Request Location Picker**:
   - Riders cannot drag a pin or click on a map to designate their exact pickup point; they must type text or use predefined presets.

---

## 9. Security Gap

1. **Trivial User Impersonation (Zero Auth)**:
   - Any client can pass `X-User-Id: <any_uuid>` in request headers and assume any identity, approve rides, or access admin audit logs.
2. **Insecure Direct Object Reference (IDOR)**:
   - `/api/v1/ride-requests/{id}/accept` verifies that `ride.driver_id === actorId`, but does not verify that `request.organization_id === actor.organization_id`. An attacker could approve requests across organizational boundaries if UUIDs are known.
3. **PII Data Exposure**:
   - Driver and passenger email addresses and phone numbers are exposed in plain text in ride manifests and search responses without privacy masking or consent gates.
4. **Missing Rate Limiting**:
   - Endpoints have no IP-based or tenant-based rate limiting, leaving the booking and search endpoints open to brute-force reservation attacks.

---

## 10. Recommended Fixes

1. **Phase A (Immediate - Persistence & Auth Guard)**:
   - Wire Drizzle ORM to a live PostgreSQL container executing `docs/DATABASE_SCHEMA.md`.
   - Replace `X-User-Id` with signed JWT tokens containing `user_id`, `organization_id`, and `capabilities`.
2. **Phase B (Google Maps API Integration)**:
   - Integrate `@react-google-maps/api` on the frontend.
   - Implement Google Places Autocomplete for origin, destination, and pickup points.
   - Call Google Directions API on ride creation to extract real road distance, duration, overview polyline, and sequential corridor waypoints.
3. **Phase C (Dynamic Search & UI Generalization)**:
   - Unlock arbitrary destination search in the Rider UI.
   - Add departure time window filtering (`window_start` / `window_end`).
   - Implement sorting by detour distance and departure time.
4. **Phase D (Vehicle & Schema Expansion)**:
   - Add `vehicle_type` enum (`CAR`, `MOTORCYCLE`, `VAN`) and adjust seat check constraints to allow two-wheelers.

---

## Deep Dive: Critical Product Checks (A through N)

### A. Organization
| Check | Status | Analysis |
| :--- | :--- | :--- |
| **Genuinely organization-scoped?** | **PARTIAL** | Schema is 100% org-scoped (`organization_id` on all tables). In-memory code checks org in search/rides, but lacks an automated middleware boundary. |
| **`organization_id` enforced everywhere?** | **VERIFIED (Schema) / PARTIAL (API)** | DDL enforces `organization_id NOT NULL` with foreign keys. API context extracts it from header with default fallback. |
| **Future 2nd org supported without redesign?** | **VERIFIED** | DDL and data model are completely multi-tenant ready. Zero DDL alterations needed to introduce a second corporate client. |

---

### B. Admin Registration & Authentication
| Check | Status | Analysis |
| :--- | :--- | :--- |
| **Can only admin register users?** | **NOT IMPLEMENTED** | No user registration API exists. Users are hardcoded in `seed-data.ts`. |
| **Real activation/login flow?** | **NOT IMPLEMENTED** | Zero authentication flow (no password, OTP, or SSO login). |
| **Is `x-user-id` only a dev mechanism?** | **VERIFIED (As intended for dev)** | Confirmed: `X-User-Id` is purely a prototyping shim and must not ship to production. |
| **Intended production auth mechanism?** | **SPECIFIED IN DOCS** | Documented in `docs/PRODUCT_SPEC.md` and `docs/ARCHITECTURE.md` as corporate SSO (SAML 2.0 / OIDC) + signed JWTs. |

---

### C. User Capabilities
| Check | Status | Analysis |
| :--- | :--- | :--- |
| **Can user both offer and request rides?** | **VERIFIED** | Alex Rivera and Sarah Chen have both `can_ride = true` and `can_drive = true`. They can publish rides and request seats. |
| **Represented independently of role field?** | **VERIFIED** | Modeled as distinct booleans in `user_capabilities` table rather than a rigid enum. |

---

### D. Vehicles
| Check | Status | Analysis |
| :--- | :--- | :--- |
| **Car and bike supported?** | **NOT IMPLEMENTED** | Only cars supported. Check constraint `total_seats >= 2` and missing `vehicle_type` column block motorcycles/bikes. |
| **Multiple vehicles per user?** | **VERIFIED** | `vehicles.owner_id` is a 1-to-many relationship. A driver can own multiple cars. |
| **Vehicle ownership independent of rides?** | **VERIFIED** | `vehicles` is decoupled from `rides`. Rides reference a registered `vehicle_id`. |

---

### E. Ride
| Check | Status | Analysis |
| :--- | :--- | :--- |
| **Office, Home, Custom destination?** | **PARTIAL** | Supported in data schema, but Web UI publish form uses fixed addresses. |
| **Date / Time?** | **VERIFIED** | Both `departure_time` and `arrival_time_estimated` stored and validated. |
| **Vehicle & Seats?** | **VERIFIED** | Vehicle selection and seat capacity limits enforced. |
| **Trip Notes & Cancellation?** | **VERIFIED** | Driver can add notes and cancel with mandatory reason. |

---

### F. Routing & Google Maps Integration (CRITICAL)

> [!CAUTION]
> **Google Maps Status: NOT INTEGRATED**  
> The application uses an SVG-based custom coordinate plot (`CorridorMap.tsx`) and hardcoded coordinate points. There is **no Google Maps API client or backend proxy integrated**.

| Google Maps Capability | Status | Evidence from Codebase |
| :--- | :---: | :--- |
| **1. Google place search** | **MISSING** | No Autocomplete API. Uses predefined `<select>` presets in [`page.tsx:75`](file:///c:/Users/Prakhar%20Singh/Documents/antigravity/bold-volta/src/app/page.tsx#L75). |
| **2. Google route suggestions** | **MISSING** | No Directions API integration. |
| **3. Selecting a Google route** | **MISSING** | No UI route alternatives or route selection. |
| **4. Route distance / duration** | **PARTIAL** | Hardcoded values (53,200m / 2,700s) stored in seed data and publish payload. |
| **5. Route polyline** | **PARTIAL** | Schema has `overview_polyline TEXT` column; rendered as straight SVG lines between waypoints. |
| **6. Custom destination** | **PARTIAL** | Schema allows it; UI rider search restricts destination to corporate HQ. |
| **7. Custom route using waypoints** | **PARTIAL** | `route_waypoints` table stores ordered waypoints, but UI submits static waypoints array. |
| **8. Saving selected route** | **PARTIAL** | Stored in `ride_routes` and `route_waypoints` records, but originated from mock data. |
| **9. Reproducing route later** | **VERIFIED** | Stored waypoints are fetched and rendered consistently in the SVG visualizer. |

---

### G. Commuter Search
| Check | Status | Analysis |
| :--- | :--- | :--- |
| **Nearby rides** | **VERIFIED** | Evaluates Haversine distance from rider origin to all route waypoints. |
| **Destination compatibility** | **PARTIAL** | Verified against HQ, but arbitrary destination matching is not exposed in UI. |
| **Route compatibility** | **VERIFIED** | Validates that route passes near pickup point within `maxDetourMeters`. |
| **Timing compatibility** | **PARTIAL** | Filters by calendar date (`YYYY-MM-DD`), but ignores departure time window. |
| **Sorting / Ranking** | **NOT IMPLEMENTED** | Returns unranked results in natural insertion order. |
| **Detour calculation** | **VERIFIED** | Calculates and displays exact detour distance (e.g. `450m from driver path`). |
| **Available seats** | **VERIFIED** | Only displays rides with `available_seats >= requested_seats`. |

---

### H. Pickup & Drop Points
| Check | Status | Analysis |
| :--- | :--- | :--- |
| **Commuter-specific pickup & drop?** | **VERIFIED** | Created as independent `pickup_points` and `drop_points` entities per booking. |
| **Geographic validation?** | **PARTIAL** | Validates $-90 \le \text{lat} \le 90$ and $-180 \le \text{lng} \le 180$, but lacks street-level geocoding check. |
| **Maximum acceptable detour?** | **VERIFIED** | Enforces `maxDetourMeters = 3000`. |
| **Driver route remains authoritative?** | **VERIFIED** | Driver's route waypoints are never altered by passenger pickup points. |
| **Multiple commuters with distinct points?** | **VERIFIED** | David Kim and Sarah Chen each have independent pickup/drop records along the same ride. |

---

### I. Ride Request State Machine
| Check | Status | Analysis |
| :--- | :--- | :--- |
| **PENDING, ACCEPTED, REJECTED, CANCELLED, EXPIRED, COMPLETED** | **VERIFIED** | All 6 states modeled in `RideRequestStatus` enum and state machine transition matrix. |
| **Invalid transition guards** | **VERIFIED** | Unit test suite verifies that invalid transitions throw `InvalidStateTransitionError`. |
| **Background expiration** | **NOT IMPLEMENTED** | No worker process automatically triggers `EXPIRED` status. |

---

### J. Seat Concurrency
| Check | Status | Analysis |
| :--- | :--- | :--- |
| **Atomic acceptance** | **VERIFIED** | Decrements `available_seats` in the same operation as setting `status = 'ACCEPTED'`. |
| **No overbooking** | **VERIFIED** | Verified: Booking the last seat brings available seats to 0; subsequent requests fail with `HTTP 409 Conflict`. |
| **Duplicate request prevention** | **VERIFIED** | Blocked via unique index in SQL and memory check in API. |
| **Cancellation seat restoration** | **VERIFIED** | Cancelling an accepted booking restores exact seat count; cancelling a pending request does not. |
| **Transaction boundaries** | **PARTIAL** | Guaranteed in-memory; requires PostgreSQL `SELECT ... FOR UPDATE` connection in production. |

---

### K. Audit Trail
| Check | Status | Analysis |
| :--- | :--- | :--- |
| **State transitions auditable?** | **VERIFIED** | `audit_logs` records `actor_user_id`, `entity_type`, `entity_id`, `action`, `from_state`, `to_state`, and metadata. |
| **Admin visibility?** | **VERIFIED** | Admin UI tab provides real-time audit event inspection. |

---

### L. Database Future Expansion Protection
| Future Area | Risk Level | Assessment |
| :--- | :---: | :--- |
| **Mobile Application** | **NONE** | APIs return pure JSON with ISO-8601 timestamps and UUIDs. Ready for mobile client. |
| **Recurring Rides** | **LOW** | `rides` models concrete instances; ready for parent `ride_schedules` template table. |
| **Ratings & Feedback** | **NONE** | Mutual ratings table can reference `ride_id` and `users` with zero schema disruption. |
| **SOS / Safety** | **NONE** | Audit logs and discrete pickup/drop coordinates support incident tracking table. |
| **Analytics & ESG** | **NONE** | Distances and seat occupancy telemetry are fully recorded. |
| **AI Corridor Matching** | **NONE** | Waypoints stored as discrete coordinates, ready for PostGIS or vector indexing. |
| **Multi-Organization** | **NONE** | `organization_id` exists on all 13 tables. |

---

### M. Web vs. Mobile Architecture
| Check | Status | Analysis |
| :--- | :--- | :--- |
| **No mobile UI built?** | **VERIFIED** | Only responsive Next.js web application exists. |
| **APIs client-independent?** | **VERIFIED** | Endpoints are headless RESTful JSON under `/api/v1/...`. |
| **Business logic decoupled from React?** | **VERIFIED** | State machines and search math live in `src/domain/` and `src/services/`. |
| **Mobile app can consume same API?** | **VERIFIED** | Mobile apps can consume identical endpoints without changes. |

---

### N. Security Audit
| Area | Severity | Finding |
| :--- | :---: | :--- |
| **Authentication** | **CRITICAL** | Zero authentication; uses spoofable `X-User-Id` header. |
| **Authorization** | **HIGH** | Missing cross-tenant IDOR validation on request acceptance. |
| **User Impersonation** | **CRITICAL** | Any user can switch to Admin or Driver identity via header. |
| **Admin Authorization** | **HIGH** | No middleware guarding administrative endpoints like `/api/v1/audit-logs`. |
| **PII Exposure** | **MEDIUM** | Driver and passenger phone numbers and emails exposed without masking. |

---

## Final Evaluation Metrics

```
+-----------------------------------------------------------------------------+
|                             AUDIT SCORECARD                                 |
+-----------------------------------------------------------------------------+
| 1. V1 Readiness Score:          58 / 100                                    |
| 2. Database Safety Score:       92 / 100                                    |
| 3. Product Completeness Score:  64 / 100                                    |
| 4. Security Readiness Score:    30 / 100                                    |
+-----------------------------------------------------------------------------+
```

### Top 10 Issues Ordered by Severity

| # | Severity | Issue | Impact |
| :-: | :---: | :--- | :--- |
| **1** | **CRITICAL** | No real authentication (Client-controlled `X-User-Id`) | Complete impersonation and unauthorized data access. |
| **2** | **CRITICAL** | Google Maps is not integrated (Simulated SVG & hardcoded presets) | Users cannot search real locations or calculate dynamic routes. |
| **3** | **HIGH** | In-memory persistence (`DataStore`) without live PostgreSQL | All data resets on server restart; no distributed locking. |
| **4** | **HIGH** | Missing cross-tenant IDOR verification on booking mutations | Potential cross-organization request tampering. |
| **5** | **HIGH** | No user registration or invite activation flow | Inability to onboard real corporate employees without database scripts. |
| **6** | **MEDIUM** | Hardcoded origin and destination in driver ride publish UI | Drivers cannot offer rides outside the hardcoded SF-to-MV corridor. |
| **7** | **MEDIUM** | No search result ranking or departure time window filtering | Commuters see unranked results and cannot filter by time of day. |
| **8** | **MEDIUM** | Motorcycle and two-wheeler carpooling blocked | `CHECK (total_seats >= 2)` and lack of `vehicle_type` blocks bikes. |
| **9** | **MEDIUM** | No background cron worker for ride/request expiration | Rides stay `SCHEDULED` and requests stay `PENDING` past departure time. |
| **10**| **LOW** | PII exposure in passenger manifest responses | Phone numbers and emails visible to unconfirmed co-passengers. |

---

## Exact Files Requiring Modification for V1 Production Readiness

1. **`src/services/api-context.ts`**: Replace `X-User-Id` header parsing with JWT/session token verification and tenant cryptographic binding.
2. **`src/domain/types.ts`**: Add `vehicle_type` enum (`CAR`, `MOTORCYCLE`, `VAN`) to `Vehicle`.
3. **`docs/DATABASE_SCHEMA.md`**: Update vehicle check constraints to permit 1-passenger two-wheelers.
4. **`src/services/data-store.ts`**: Replace in-memory map storage with PostgreSQL connection pool (Drizzle ORM) and add `FOR UPDATE` transaction locks.
5. **`src/app/page.tsx`**: Replace hardcoded address inputs with Google Places Autocomplete; replace SVG visualizer with Google Maps interactive map.
6. **`src/components/CorridorMap.tsx`**: Upgrade from static SVG plot to Google Maps `@react-google-maps/api` polyline and marker overlay.
7. **`src/app/api/v1/rides/route.ts`**: Integrate Google Directions API to compute real driving route distance, duration, and waypoints dynamically.
8. **`src/app/api/v1/rides/search/route.ts`**: Implement time-window filtering (`window_start`, `window_end`) and sorting by detour distance.
9. **`src/app/api/v1/ride-requests/[id]/accept/route.ts`**: Add explicit `organization_id` tenant isolation checks.
10. **`src/app/api/v1/audit-logs/route.ts`**: Add admin role authorization guard (`capabilities.is_org_admin === true`).

---

## Recommended Next Gstack Command

To systematically plan and resolve these audited gaps with architectural rigor:
```bash
/autoplan
```
*(Runs the full Gstack planning gauntlet: CEO review for scope decisions on Google Maps & authentication, Engineering review for live database wiring and transaction locking, and Design review for the interactive map UI).*
