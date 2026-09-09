# Corporate Carpooling Platform: Product Specification (V1 Web)

## 1. Executive Summary & Vision

The Corporate Carpooling Platform is an enterprise-grade ride-sharing solution tailored for verified corporate employees commuting between residential areas and corporate campuses or transit hubs.

The platform's primary mission is to:
1. **Reduce Commute Friction & Costs**: Enable employees to split commuting costs and reduce single-occupancy vehicle stress.
2. **Drive ESG / Corporate Sustainability Goals**: Lower organizational carbon footprint with auditable commute telemetry.
3. **Foster Safe, Trusted Internal Connections**: Limit ride pools exclusively to verified corporate colleagues belonging to authorized organizational tenants.

**Scope Target for V1**: **WEB ONLY (Responsive Web Application)**.
Native mobile applications (iOS/Android) are scheduled for Phase 3, but the V1 architecture and API design must be mobile-ready and backward-compatible.

---

## 2. Target Personas & Problem Space

### 2.1 Personas

| Persona | Role | Core Goals | Pain Points & Constraints |
| :--- | :--- | :--- | :--- |
| **P1: Host Commuter (Driver)** | Full-time employee driving personal vehicle to/from work | Offset fuel/toll costs, access HOV lanes, find pleasant carpool buddies. | Unpredictable cancellations, inconvenient detours, liability concerns, manual coordination via chat apps. |
| **P2: Passenger Commuter (Rider)** | Employee without personal car or preferring not to drive | Reliable, timely, affordable commute directly to campus without multiple transit transfers. | Inconsistent schedules, fear of being stranded, lack of transparency on driver route and pickup ETA. |
| **P3: Workplace / Org Admin** | Facilities & HR / Transportation Coordinator | Manage parking demand, track Scope 3 emissions, ensure compliance and employee safety. | Zero visibility into informal carpooling, inability to verify vehicle safety or enforce company ride policies. |

---

## 3. Scope Boundaries: V1 vs. Future Phases

```
+-----------------------------------------------------------------------------+
|                                FEATURE SCOPE                                |
+-----------------------------------------------------------------------------+
|  IN V1 (Web Foundation)               |  FUTURE PHASES (Architected For)    |
+---------------------------------------+-------------------------------------+
| [x] Organization-scoped tenancy       | [ ] Cross-org tech park carpools   |
| [x] Work email / SSO validation       | [ ] Native iOS & Android apps     |
| [x] Driver vehicle registration       | [ ] Recurring ride schedules       |
| [x] One-way ride publishing (work/home)| [ ] Real-time GPS driver tracking  |
| [x] Structured route waypoints        | [ ] In-app chat & VoIP calling    |
| [x] Corridor search & seat requests   | [ ] Integrated corporate payroll / |
| [x] Explicit state machine lifecycle  |     automated expense deductions    |
| [x] Pickup/Drop geocoded coordinates  | [ ] Dynamic ML corridor matching   |
| [x] In-app & email notification feeds | [ ] SOS / Emergency incident mgmt  |
| [x] Comprehensive audit trail         | [ ] Star ratings & mutual reviews  |
+-----------------------------------------------------------------------------+
```

---

## 4. Key Business Rules & Policies

### 4.1 Tenancy & Identity
- **Tenant Isolation**: Every user belongs to an `Organization`. Users can only discover and book rides published by colleagues within their organization (unless a multi-org campus flag is enabled in future).
- **Domain Verification**: User registration requires a confirmed email address belonging to the organization's verified domain list (e.g., `@acme-corp.com`) or corporate SSO (SAML 2.0 / OIDC).
- **Driver Verification**: Drivers must register at least one approved vehicle with valid license plate, color, make, model, and seat capacity before publishing rides.

### 4.2 Ride Scheduling & Route Constraints
- **Directionality**: Rides must have a distinct origin and destination. A typical commute is either **Inbound to Campus** or **Outbound from Campus**.
- **Advance Notice**: Rides must be scheduled at least 30 minutes in advance of departure time.
- **Seat Capacity**: Driver specifies available passenger seats (capped by the registered vehicle's legal capacity minus 1 for the driver).
- **Structured Waypoints**: Routes are defined with an ordered list of waypoints (Origin -> Optional Waypoints -> Destination). Rides cannot be created without valid geographical coordinates (`latitude`, `longitude`) for start, end, and waypoints.

### 4.3 Booking & Detour Protocol
- **Requesting**: Riders request a seat specifying explicit `pickup_point` (lat/lng, address) and `drop_point` (lat/lng, address).
- **No Direct Mutation of Ride**: Commuter pickup/drop data is never stored directly on the `rides` table; it belongs to the `ride_requests` and `route_waypoints` relationship.
- **Driver Discretion**: Drivers have manual accept/reject authority for each booking request in V1.
- **Seat Reservation**: Approving a request reserves the requested seat count atomically. If `available_seats < requested_seats`, the transaction fails immediately.
- **Cancellation Cutoffs**:
  - Riders can cancel anytime prior to departure; seats are released immediately.
  - Drivers can cancel a ride; all accepted and pending riders receive immediate notifications with audit records created.

---

## 5. Success Metrics (V1)

1. **Ride Match Rate**: Percentage of published rides that receive and accept at least one passenger request (> 40%).
2. **Booking Completion Rate**: Percentage of accepted ride requests that transition to `COMPLETED` without cancellation (> 85%).
3. **Seat Utilization**: Average occupied seats per ride (Target: 2.2 riders per vehicle).
4. **Platform Reliability**: Zero seat over-allocation (double-booking incidents = 0).
