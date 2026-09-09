# System Overview: Corporate Carpooling Platform

## 1. High-Level Architecture & Topology

The Corporate Carpooling platform is designed using a layered, domain-centric architecture. For Phase 1 (Web Only), the architecture provides a robust, responsive web interface backed by a modular monolithic REST API with clean domain boundaries and strict multi-tenant isolation.

```
                                  +---------------------------------------+
                                  |     CLIENT LAYER (Phase 1: Web)       |
                                  |   Next.js / React (Responsive Web)    |
                                  |   Desktop Browsers & Mobile Browsers  |
                                  +---------------------------------------+
                                                     |
                                                     | HTTPS / REST / JSON
                                                     v
+---------------------------------------------------------------------------------------------------------+
|                                        API GATEWAY / ROUTING LAYER                                      |
|   - Reverse Proxy & SSL Termination (Nginx / Cloudflare)                                                |
|   - Rate Limiting, CORS, Request Validation & Correlation ID                                            |
|   - Tenant Extraction & Context Injection (Org Header / JWT Claim)                                     |
+---------------------------------------------------------------------------------------------------------+
                                                     |
                                                     v
+---------------------------------------------------------------------------------------------------------+
|                                        CORE APPLICATION SERVICES                                        |
|                                                                                                         |
|  +---------------------+  +---------------------+  +---------------------+  +------------------------+  |
|  |   Identity & Org    |  |  Vehicle Registry   |  |   Route & Geo FSM   |  |     Ride Management    |  |
|  |   - Auth & Session  |  |  - Vehicle Profiles |  |   - Structured Wpts |  |     - Scheduling       |  |
|  |   - Capabilities    |  |  - Capacity Checks  |  |   - Spatial BBox    |  |     - Seat Availability|  |
|  +---------------------+  +---------------------+  +---------------------+  +------------------------+  |
|                                                                                                         |
|  +---------------------+  +---------------------+  +---------------------+  +------------------------+  |
|  | Booking & Seat FSM  |  | Notification Engine |  | Audit & Compliance  |  | Analytics (Future)     |  |
|  | - Atomic Reserve    |  | - In-App Feed       |  | - Immutable Trails  |  | - ESG Carbon Offset    |  |
|  | - Concurrency Guard |  | - Email Outbox      |  | - State Transitions |  | - Corridor Heatmaps    |  |
|  +---------------------+  +---------------------+  +---------------------+  +------------------------+  |
+---------------------------------------------------------------------------------------------------------+
                                                     |
                                                     v
+---------------------------------------------------------------------------------------------------------+
|                                        PERSISTENCE & DATA LAYER                                         |
|  PostgreSQL 16+ with PostGIS Extension:                                                                 |
|  - Relational Integrity, Foreign Keys, Strict Check Constraints                                         |
|  - Spatial Indexing (GIST on geometry/geography)                                                        |
|  - Explicit State Machine Validation Enums                                                             |
|  - Row-Level Tenancy (`organization_id` on all operational tables)                                      |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Core Subsystems & Responsibilities

### 2.1 Identity & Organization Access Management
- Validates corporate domain emails (`@org.com`) or corporate identity providers (SAML/OIDC).
- Issues signed, stateless JWT access tokens carrying `user_id`, `organization_id`, and `capabilities`.
- Enforces strict tenant boundaries: all database queries must inject `WHERE organization_id = :org_id`.

### 2.2 Vehicle & Fleet Registry
- Manages employee vehicles: make, model, year, color, license plate, seat count.
- Enforces physical safety caps: a driver cannot offer more seats than the vehicle's legal passenger capacity (`total_seats - 1`).

### 2.3 Route & Geolocation Engine
- Handles structured route definitions (Origin -> Waypoints -> Destination).
- Stores exact coordinates (`DECIMAL(10, 7)`) and optional PostGIS geography points.
- Computes spatial bounding boxes and corridor proximity queries for search operations.
- Separates route definitions from transient ride instances, enabling route reusability.

### 2.4 Ride & Capacity Management
- Manages driver ride offerings with explicit statuses: `DRAFT`, `SCHEDULED`, `IN_PROGRESS`, `COMPLETED`, `CANCELLED`.
- Maintains atomic available seat counts with database-level constraints (`available_seats >= 0`).

### 2.5 Booking & Seat Reservation FSM
- Orchestrates rider seat requests with explicit statuses: `PENDING`, `ACCEPTED`, `REJECTED`, `CANCELLED`, `EXPIRED`.
- Employs **Optimistic Concurrency Control (OCC)** or **Pessimistic Row-Level Locks (`FOR UPDATE`)** during driver acceptance to prevent overbooking races.

### 2.6 Notification & Event Dispatcher
- Provides an asynchronous event bus pattern for domain events (e.g. `RideCreated`, `RequestAccepted`, `RideCancelled`).
- Writes to an in-app notification table and queues outgoing transactional email alerts.
- Extensible to mobile push notifications (APNs / FCM) in Phase 3 without altering core domain logic.

### 2.7 Audit & Security Trail
- An append-only audit ledger recording every lifecycle transition, cancellation, and sensitive data mutation.
- Captures `actor_user_id`, `action`, `from_state`, `to_state`, `ip_address`, and `user_agent`.

---

## 3. Security & Multi-Tenant Isolation Model

1. **Tenant Scoping**:
   - Every operational entity (`users`, `vehicles`, `rides`, `ride_routes`, `ride_requests`, `notifications`, `audit_logs`) has a mandatory `organization_id` foreign key.
   - Cross-organization queries are blocked at the repository/middleware layer.
2. **Authorization Guards**:
   - Capability-based access control (`can_drive`, `can_ride`, `is_org_admin`).
   - Drivers can only accept/reject requests for their own rides.
   - Riders can only view/cancel their own requests.
3. **Data Protection & PII**:
   - License plate and contact numbers visible only to accepted co-passengers on the same ride.
   - Passwords hashed using bcrypt/Argon2id (if not using corporate SSO).

---

## 4. Canonical Diagram: System Architecture & Subsystem Boundaries

```mermaid
flowchart TB
    subgraph ClientLayer ["Client Layer (Web Only V1 / Mobile Ready)"]
        Browser["Responsive Web App\n(Next.js / React / Tailwind)"]
        MobilePWA["Mobile Browser / PWA\n(Responsive Viewport)"]
    end

    subgraph Gateway ["API Gateway & Security Boundary"]
        ReverseProxy["Reverse Proxy / TLS Termination"]
        AuthMiddleware["Auth & Org Context Middleware\n(JWT / SSO Validation)"]
    end

    subgraph AppCore ["Core Modular Application Backend"]
        subgraph ModAuth ["Identity & Access"]
            UserService["User & Profile Service"]
            OrgService["Organization Service"]
        end

        subgraph ModVehicle ["Fleet Management"]
            VehicleService["Vehicle Registry Service"]
        end

        subgraph ModRide ["Ride & Routing Core"]
            RouteService["Route & Waypoint Service"]
            RideService["Ride Management Service"]
            SearchService["Corridor Discovery Engine"]
        end

        subgraph ModBooking ["Booking Engine"]
            BookingFSM["Booking State Machine\n(Pessimistic Seat Locking)"]
        end

        subgraph ModEvents ["Asynchronous Events & Auditing"]
            EventBus["Domain Event Dispatcher"]
            NotifyService["Notification Service (In-App & Email)"]
            AuditService["Immutable Audit Logger"]
        end
    end

    subgraph DataLayer ["PostgreSQL 16+ (PostGIS Enabled)"]
        DB_Org["organizations"]
        DB_User["users / user_capabilities\nuser_locations"]
        DB_Veh["vehicles"]
        DB_Ride["rides / ride_routes\nroute_waypoints"]
        DB_Req["ride_requests / pickup_points\ndrop_points"]
        DB_Logs["notifications / audit_logs"]
    end

    %% Wiring
    Browser --> ReverseProxy
    MobilePWA --> ReverseProxy
    ReverseProxy --> AuthMiddleware
    AuthMiddleware --> UserService
    AuthMiddleware --> VehicleService
    AuthMiddleware --> RouteService
    AuthMiddleware --> RideService
    AuthMiddleware --> SearchService
    AuthMiddleware --> BookingFSM

    BookingFSM --> EventBus
    RideService --> EventBus
    EventBus --> NotifyService
    EventBus --> AuditService

    UserService --> DB_Org
    UserService --> DB_User
    VehicleService --> DB_Veh
    RouteService --> DB_Ride
    RideService --> DB_Ride
    SearchService --> DB_Ride
    BookingFSM --> DB_Req
    BookingFSM --> DB_Ride
    NotifyService --> DB_Logs
    AuditService --> DB_Logs
```
