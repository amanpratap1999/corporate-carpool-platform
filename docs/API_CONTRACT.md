# API Contract Specification: Corporate Carpooling Platform (V1 Web)

## 1. Global API Standards & Conventions

- **Base URL**: `/api/v1`
- **Protocol**: HTTPS / RESTful JSON
- **Authentication**: `Authorization: Bearer <JWT>` containing `user_id`, `organization_id`, and `capabilities`.
- **Tenant Context**: Inferred from the authenticated JWT token and optionally supplied via `X-Organization-Id` header for cross-verification.
- **Error Standard**: RFC 7807 Problem Details (`application/problem+json`).
- **Date/Time Standard**: ISO-8601 UTC strings (`YYYY-MM-DDTHH:mm:ss.sssZ`).

---

## 2. Standard Error Response (RFC 7807)

```json
{
  "type": "https://api.carpool.corp/errors/insufficient-seats",
  "title": "Insufficient Seats Available",
  "status": 409,
  "detail": "Cannot reserve 2 seats. Only 1 seat remains on this ride.",
  "instance": "/api/v1/ride-requests/4a6d1e57-2e11-4777-b9c2-9658db4f5ad1/accept",
  "code": "INSUFFICIENT_SEATS",
  "timestamp": "2026-09-09T12:00:00Z"
}
```

---

## 3. Endpoints Matrix

### 3.1 Authentication & Profile

#### `GET /api/v1/me`
Retrieves the authenticated user's profile, tenant info, and capabilities.
- **Response `200 OK`**:
  ```json
  {
    "id": "c1f727c9-55e1-455b-b9f1-a1d821217e99",
    "organization_id": "b3e0281b-53c8-4720-a619-ec12a9e52c80",
    "organization_name": "Acme Global",
    "email": "jane.doe@acme.com",
    "full_name": "Jane Doe",
    "work_department": "Engineering",
    "capabilities": {
      "can_ride": true,
      "can_drive": true,
      "is_org_admin": false,
      "driver_verified_at": "2026-09-01T08:00:00Z"
    }
  }
  ```

---

### 3.2 Saved User Locations

#### `GET /api/v1/user-locations`
Returns saved locations for the user (e.g. Home, HQ Campus).

#### `POST /api/v1/user-locations`
- **Request Body**:
  ```json
  {
    "label": "Home",
    "address_text": "742 Evergreen Terrace, Springfield",
    "latitude": 37.7749295,
    "longitude": -122.4194155,
    "is_default_pickup": true,
    "is_default_drop": false
  }
  ```
- **Response `201 Created`**: Returns the created location object with `id`.

---

### 3.3 Vehicle Registry (Driver)

#### `GET /api/v1/vehicles`
Returns the list of vehicles registered by the authenticated user.

#### `POST /api/v1/vehicles`
- **Request Body**:
  ```json
  {
    "make": "Toyota",
    "model": "Camry Hybrid",
    "year": 2023,
    "color": "Silver",
    "license_plate": "7XYZ999",
    "total_seats": 5
  }
  ```
- **Response `201 Created`**:
  ```json
  {
    "id": "e818816c-b3a6-42f1-a67b-1cb8f9d0c644",
    "owner_id": "c1f727c9-55e1-455b-b9f1-a1d821217e99",
    "make": "Toyota",
    "model": "Camry Hybrid",
    "license_plate": "7XYZ999",
    "total_seats": 5,
    "status": "ACTIVE"
  }
  ```

---

### 3.4 Rides (Driver Journey)

#### `POST /api/v1/rides`
Publishes a new ride offering with structured route and waypoints.
- **Request Body**:
  ```json
  {
    "vehicle_id": "e818816c-b3a6-42f1-a67b-1cb8f9d0c644",
    "departure_time": "2026-09-10T08:15:00Z",
    "arrival_time_estimated": "2026-09-10T09:00:00Z",
    "total_seats_offered": 3,
    "cost_per_seat_cents": 350,
    "notes": "Non-smoking, AC on, trunk space available for backpacks.",
    "route": {
      "origin_address": "742 Evergreen Terrace, Springfield",
      "origin_latitude": 37.7749295,
      "origin_longitude": -122.4194155,
      "destination_address": "Corporate HQ Building A, Tech Park",
      "destination_latitude": 37.4220656,
      "destination_longitude": -122.0840897,
      "total_distance_meters": 42500,
      "total_duration_seconds": 2700,
      "bounding_box": {
        "min_lat": 37.4220,
        "max_lat": 37.7749,
        "min_lng": -122.4194,
        "max_lng": -122.0840
      },
      "waypoints": [
        {
          "stop_order": 0,
          "point_type": "ORIGIN",
          "address_text": "742 Evergreen Terrace, Springfield",
          "latitude": 37.7749295,
          "longitude": -122.4194155,
          "estimated_arrival_offset_seconds": 0
        },
        {
          "stop_order": 1,
          "point_type": "CORRIDOR",
          "address_text": "Millbrae BART Transit Center",
          "latitude": 37.5997,
          "longitude": -122.3867,
          "estimated_arrival_offset_seconds": 900
        },
        {
          "stop_order": 2,
          "point_type": "DESTINATION",
          "address_text": "Corporate HQ Building A, Tech Park",
          "latitude": 37.4220656,
          "longitude": -122.0840897,
          "estimated_arrival_offset_seconds": 2700
        }
      ]
    }
  }
  ```
- **Response `201 Created`**: Returns full Ride record with status `SCHEDULED`.

#### `POST /api/v1/rides/{id}/start`
Driver starts the trip.
- Transitions status: `SCHEDULED` -> `IN_PROGRESS`.
- Response `200 OK`.

#### `POST /api/v1/rides/{id}/complete`
Driver finishes trip at destination.
- Transitions status: `IN_PROGRESS` -> `COMPLETED`.
- Response `200 OK`.

#### `POST /api/v1/rides/{id}/cancel`
Driver cancels the trip.
- **Request Body**: `{"reason": "Vehicle mechanical issue"}`
- Transitions status: `SCHEDULED` -> `CANCELLED`.
- Releases all accepted requests, restores state, notifies all passengers.
- Response `200 OK`.

---

### 3.5 Ride Discovery & Corridor Search (Rider Journey)

#### `GET /api/v1/rides/search`
Queries active rides matching the commuter's corridor.
- **Query Parameters**:
  - `origin_lat` (required): Decimal
  - `origin_lng` (required): Decimal
  - `dest_lat` (required): Decimal
  - `dest_lng` (required): Decimal
  - `date` (required): `YYYY-MM-DD`
  - `time_window_start` (optional): ISO timestamp
  - `time_window_end` (optional): ISO timestamp
  - `seats_needed` (optional, default: 1): Integer
  - `max_pickup_detour_meters` (optional, default: 2000): Integer
- **Response `200 OK`**:
  ```json
  {
    "rides": [
      {
        "id": "76d8b941-7667-4632-9c16-09e863378546",
        "driver": {
          "id": "c1f727c9-55e1-455b-b9f1-a1d821217e99",
          "full_name": "Jane Doe",
          "department": "Engineering"
        },
        "vehicle": {
          "make": "Toyota",
          "model": "Camry Hybrid",
          "color": "Silver"
        },
        "departure_time": "2026-09-10T08:15:00Z",
        "available_seats": 3,
        "cost_per_seat_cents": 350,
        "route_summary": {
          "origin_address": "742 Evergreen Terrace",
          "destination_address": "Corporate HQ Building A",
          "nearest_pickup_waypoint_distance_meters": 450
        }
      }
    ]
  }
  ```

---

### 3.6 Ride Requests (Booking FSM)

#### `POST /api/v1/rides/{ride_id}/requests`
Rider requests to book seats on a ride.
- **Request Body**:
  ```json
  {
    "requested_seats": 1,
    "rider_note": "I'll wait near the north gate transit shelter.",
    "pickup_point": {
      "address_text": "Millbrae BART North Station",
      "latitude": 37.5999,
      "longitude": -122.3865,
      "landmark_note": "Under the north passenger awning"
    },
    "drop_point": {
      "address_text": "Corporate HQ Building A",
      "latitude": 37.4220656,
      "longitude": -122.0840897,
      "landmark_note": "Visitor turnstile"
    }
  }
  ```
- **Response `202 Accepted`**:
  ```json
  {
    "id": "90e66c90-07bf-4f10-9114-1ee6b15e45c7",
    "ride_id": "76d8b941-7667-4632-9c16-09e863378546",
    "status": "PENDING",
    "requested_seats": 1,
    "created_at": "2026-09-09T17:30:00Z"
  }
  ```

#### `POST /api/v1/ride-requests/{id}/accept`
Driver approves request. Executes atomic seat decrement and creates manifest record.
- **Response `200 OK`**: Status is now `ACCEPTED`.

#### `POST /api/v1/ride-requests/{id}/reject`
Driver rejects request.
- **Request Body**: `{"reason": "Route detour exceeds time threshold"}`
- **Response `200 OK`**: Status is now `REJECTED`.

#### `POST /api/v1/ride-requests/{id}/cancel`
Rider withdraws request. If previously `ACCEPTED`, atomically restores seats to the ride.
- **Request Body**: `{"reason": "Working from home today"}`
- **Response `200 OK`**: Status is now `CANCELLED`.

---

### 3.7 Notifications & In-App Alerts

#### `GET /api/v1/notifications`
- **Response `200 OK`**: List of recent in-app alerts, unread counts, and deep links.

#### `PATCH /api/v1/notifications/{id}/read`
- Marks notification as read (`read_at = NOW()`).
