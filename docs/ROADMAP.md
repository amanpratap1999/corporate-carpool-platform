# Product Roadmap: Corporate Carpooling Platform

## 1. Evolution Strategy & Phases

```
+---------------------------------------------------------------------------------------------------+
| PHASE 1: WEB FOUNDATION (CURRENT TARGET)                                                          |
| Q1 - Q2: Core domain, org tenancy, vehicle registry, one-way rides, route corridor discovery,     |
| booking state machines, responsive web UI, audit & notifications.                                 |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| PHASE 2: COMMUTE AUTOMATION & PWA ENHANCEMENTS                                                    |
| Q3: Recurring ride schedules (templates & instance generation), saved commute presets,           |
| calendar sync (iCal/Outlook), multi-rider manifest optimization, PWA push alerts.                 |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| PHASE 3: NATIVE MOBILE & REAL-TIME TELEMETRY                                                      |
| Q4: Dedicated iOS & Android apps (React Native/Flutter), driver GPS background tracking,          |
| proximity-based pickup alerts, in-app safety SOS triggers, mutual star ratings & driver feedback. |
+---------------------------------------------------------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
| PHASE 4: ENTERPRISE ESG & AI MATCHING ENGINE                                                      |
| Q1+: AI-powered detour & corridor scoring, cross-organization tech-park clustering,               |
| automated payroll cost-sharing, Scope 3 corporate carbon offset audit reports.                     |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Roadmap Milestone Details

### Phase 1: Web Foundation (Current Focus)
- **Tenancy & Auth**: Verified enterprise domain signup (`@company.com`), JWT authentication, Org-scoped user models.
- **Identity & Capabilities**: Dual roles (Rider and Driver) per employee; driver vehicle registration and seat capacity limits.
- **Locations & Waypoints**: Saved Home and Office location presets; structured route waypoints (origin, destination, intermediate corridor coordinates).
- **Ride Lifecycle**: Driver ride creation (departure time, available seats, notes); search by origin/destination proximity and departure window.
- **Booking Engine**: Explicit atomic seat reservations with `PENDING` -> `ACCEPTED` / `REJECTED` state transitions. Concurrency-safe against race conditions.
- **Communications**: Real-time in-app notification center + email delivery for lifecycle changes.
- **Compliance & Audit**: Full audit logging for security, cancellations, and capacity alterations.

### Phase 2: Recurring Rides & PWA (Future)
- **Schedule Templates**: Mon-Fri recurring morning/evening commute definitions.
- **Automated Generation**: Background worker generating ride instances `N` days ahead.
- **Calendar Integration**: One-click add to Google Calendar and Microsoft Outlook 365.
- **PWA Capabilities**: Service worker offline shell and Web Push API.

### Phase 3: Mobile Apps & Live Telemetry (Future)
- **Mobile Native**: iOS & Android apps utilizing same RESTful API backend.
- **Driver GPS Streams**: WebSockets/SSE broadcast of driver coordinates during active rides.
- **Pickup Beacons**: Geofence triggers ("Driver is 3 minutes away").
- **Safety & Incident Management**: SOS emergency button with live location broadcast to corporate security.
- **Ratings & Reviews**: Post-ride double-blind 1-5 star ratings and feedback tags.

### Phase 4: Enterprise Intelligence & ESG (Future)
- **AI Corridor Matching**: Vector similarity / geospatial ML matching passenger detour tolerance to driver routes.
- **Carbon Accounting**: Greenhouse Gas (GHG) Protocol Scope 3 commuter emissions reductions dashboard.
- **Corporate Expense Settlement**: Automatic micropayments or corporate commute subsidy credits.
- **Multi-tenant Tech Parks**: Inter-company carpool corridors for shared corporate parks.

---

## 3. Canonical Diagram: Roadmap Progression

```mermaid
gantt
    title Corporate Carpooling Architecture & Product Roadmap
    dateFormat  YYYY-MM-DD
    section Phase 1 (Web Only)
    Architecture Foundation & Schema Design :done, p1_arch, 2026-09-01, 7d
    Core Tenancy, Auth & Profile Service   :active, p1_auth, 2026-09-08, 10d
    Vehicle & Driver Registry Service       :p1_veh, after p1_arch, 7d
    Route & Waypoint Geocoding Engine       :p1_route, after p1_veh, 10d
    Ride Publishing & Search Service        :p1_ride, after p1_route, 10d
    Atomic Booking & State Machine Engine   :p1_book, after p1_ride, 10d
    Responsive Web UI Implementation        :p1_ui, after p1_book, 14d
    Audit Logging & Notification System     :p1_audit, after p1_book, 7d
    section Phase 2 (Automation)
    Recurring Ride Templates Engine         :p2_recur, 2026-11-01, 14d
    Commute Calendar Synchronization        :p2_cal, after p2_recur, 7d
    PWA Offline Support & Web Push          :p2_pwa, after p2_cal, 10d
    section Phase 3 (Mobile & Safety)
    Mobile REST API Contracts & Auth Gate   :p3_api, 2027-01-01, 10d
    React Native Mobile Client Core         :p3_mob, after p3_api, 21d
    Real-time GPS Tracking & Geofences      :p3_gps, after p3_mob, 14d
    Safety SOS & Incident Dispatch          :p3_sos, after p3_gps, 7d
    Mutual Ratings & Reputation Scores      :p3_rate, after p3_sos, 7d
    section Phase 4 (AI & Enterprise ESG)
    AI Corridor Matching & Detour Engine    :p4_ai, 2027-03-15, 21d
    Scope 3 ESG Carbon Analytics            :p4_esg, after p4_ai, 14d
    Multi-tenant Tech Park Federation       :p4_fed, after p4_esg, 14d
```
