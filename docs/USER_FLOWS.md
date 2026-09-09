# User Flows: Corporate Carpooling Platform (V1 Web)

## 1. Overview of Primary Personas & Journeys

The Corporate Carpooling platform operates on a collaborative peer model within an enterprise boundary:
- **Driver (Host Commuter)**: Offers empty car seats along their daily commute route.
- **Rider (Passenger Commuter)**: Books an available seat matching their pickup and drop-off points.
- **Organization Admin**: Approves driver registrations and oversees compliance/safety audits.

---

## 2. End-to-End User Flow Journeys

### Flow A: Driver Journey (Offer Ride to Completion)
1. **Authentication**: Sign in via corporate work email or Single Sign-On (SSO).
2. **Vehicle Registration**:
   - Provide Vehicle Make, Model, Year, Color, License Plate Number, Total Passenger Capacity.
   - Initial status: `ACTIVE` (or `PENDING_VERIFICATION` if admin approval required).
3. **Publish Ride**:
   - Select Vehicle.
   - Choose Origin (e.g., Saved "Home" or typed address) and Destination (e.g., "Corporate HQ").
   - Specify Departure Date & Time.
   - Enter Available Seats (1 to Vehicle Capacity - 1).
   - Structured Route Waypoints generated (Origin, Corridor Waypoints, Destination).
   - Ride status set to `SCHEDULED`.
4. **Manage Incoming Ride Requests**:
   - Receive in-app and email notification: "Jane requested 1 seat from Main St. Metro to HQ".
   - Review Passenger profile, requested pickup point, drop-off point, and detour time.
   - Action: **Accept** or **Reject**.
   - If Accepted: Seat count decreases atomically; Passenger is added to Ride Manifest.
5. **Ride Execution**:
   - On departure: Driver marks ride as `IN_PROGRESS`.
   - Driver arrives at pickup points and confirms passenger boardings.
   - Driver completes journey at corporate destination: marks ride `COMPLETED`.
6. **Cancellation Path**:
   - Driver cancels before departure: System marks ride `CANCELLED`, releases reservations, triggers high-priority notifications to all riders, logs audit event.

---

### Flow B: Rider Journey (Search, Book, and Commute)
1. **Authentication & Profile Setup**:
   - Sign in via corporate domain.
   - Save frequent commute locations (Home, Corporate Office, Gym/Transit Hub).
2. **Ride Discovery**:
   - Search parameters: Pickup location (or proximity radius), Drop-off location, Date, Departure Window (+/- 30 min).
   - System queries active `SCHEDULED` rides matching the corridor with `available_seats >= requested_seats`.
3. **Request a Seat**:
   - Select matching ride.
   - Confirm explicit `pickup_point` (lat/lng, address) and `drop_point` (lat/lng, address).
   - Enter seat count (default: 1).
   - Submit request -> status becomes `PENDING`.
4. **Request Resolution**:
   - **Scenario 1 (Accepted)**: Notification received; status becomes `ACCEPTED`. Ride details, driver vehicle details, and meeting point confirmed.
   - **Scenario 2 (Rejected)**: Notification received; status becomes `REJECTED`. Reason displayed; rider guided to alternative rides.
   - **Scenario 3 (Cancelled by Rider)**: Rider cancels before pickup; status becomes `CANCELLED`. Seats immediately restored to driver's ride.
5. **Ride Execution**:
   - Rider waits at designated pickup point.
   - Driver arrives; rider boards vehicle.
   - Rider arrives at destination; ride marked `COMPLETED`.

---

### Flow C: Organization Admin Journey
1. **Admin Dashboard Access**: Authenticated as user with capability `is_org_admin = true`.
2. **Vehicle & Driver Verification**: Review registered vehicles, verify license plates against company parking permits.
3. **Audit & Safety Logs**: Inspect ride lifecycle events, cancellation patterns, and user activity history.

---

## 3. Canonical Diagram: Complete User Flow & Decision Logic

```mermaid
sequenceDiagram
    autonumber
    actor Driver as Driver (Host)
    actor Rider as Rider (Passenger)
    participant Web as Web Application
    participant API as Backend API & FSM
    participant DB as PostgreSQL (PostGIS)
    participant Notify as Notification Engine

    %% 1. Publish Ride
    rect rgb(240, 248, 255)
    Note over Driver, DB: 1. Ride Creation & Route Calculation
    Driver->>Web: Input Origin, Destination, Departure Time, Seats, Vehicle
    Web->>API: POST /api/v1/rides (with route waypoints)
    API->>DB: INSERT INTO ride_routes, route_waypoints, rides (status: SCHEDULED)
    DB-->>API: Ride ID, Route ID
    API-->>Web: 201 Created (Ride Published)
    end

    %% 2. Search & Request
    rect rgb(255, 250, 240)
    Note over Rider, DB: 2. Corridor Search & Seat Request
    Rider->>Web: Search (Pickup, Drop, Date, Time Window)
    Web->>API: GET /api/v1/rides/search?origin_lat=...&dest_lat=...
    API->>DB: Geospatial Corridor Query (PostGIS ST_DWithin / Bounding Box)
    DB-->>API: Matching Rides with available_seats >= 1
    API-->>Web: 200 OK (List of Rides)
    Rider->>Web: Request Seat (Select Pickup/Drop Point)
    Web->>API: POST /api/v1/rides/{id}/requests
    API->>DB: INSERT INTO ride_requests (status: PENDING)
    API->>Notify: Dispatch "RIDE_REQUESTED" Event
    Notify-->>Driver: In-App & Email Alert ("New Seat Request")
    API-->>Web: 202 Accepted (Request Pending)
    end

    %% 3. Request Decision
    rect rgb(245, 255, 250)
    Note over Driver, Notify: 3. Atomic Driver Decision & Seat Allocation
    Driver->>Web: Review Request Details (Rider Name, Detour, Waypoint)
    alt Driver Accepts
        Driver->>Web: Click "Accept Request"
        Web->>API: POST /api/v1/ride-requests/{id}/accept
        API->>DB: BEGIN TX; Lock Ride FOR UPDATE; Check available_seats >= req; Decrement available_seats; UPDATE ride_requests SET status = 'ACCEPTED'; COMMIT TX;
        API->>Notify: Dispatch "REQUEST_ACCEPTED" Event
        Notify-->>Rider: Alert ("Your Ride is Confirmed!")
        API-->>Web: 200 OK (Request Accepted)
    else Driver Rejects
        Driver->>Web: Click "Reject Request" (Provide optional reason)
        Web->>API: POST /api/v1/ride-requests/{id}/reject
        API->>DB: UPDATE ride_requests SET status = 'REJECTED'
        API->>Notify: Dispatch "REQUEST_REJECTED" Event
        Notify-->>Rider: Alert ("Request Declined by Host")
        API-->>Web: 200 OK (Request Rejected)
    end
    end

    %% 4. Execution & Completion
    rect rgb(255, 245, 245)
    Note over Driver, DB: 4. Ride Lifecycle Execution
    Driver->>Web: Click "Start Ride" (Departure Time)
    Web->>API: POST /api/v1/rides/{id}/start
    API->>DB: UPDATE rides SET status = 'IN_PROGRESS'
    API->>Notify: Dispatch "RIDE_STARTED" to all accepted passengers
    Notify-->>Rider: Alert ("Driver has departed!")
    Driver->>Web: Arrive at Campus -> Click "Complete Ride"
    Web->>API: POST /api/v1/rides/{id}/complete
    API->>DB: UPDATE rides SET status = 'COMPLETED'
    API->>Notify: Dispatch "RIDE_COMPLETED"
    Notify-->>Rider: Alert ("Ride Completed. Thank you for carpooling!")
    end
```
