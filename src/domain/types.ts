/**
 * Corporate Carpooling Platform: Domain Types & Invariants
 * Aligned with docs/DATABASE_SCHEMA.md
 */

export type UUID = string;

// ----------------------------------------------------------------------------
// Domain Enums
// ----------------------------------------------------------------------------

export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';

export type VehicleStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING_INSPECTION';

export type RideStatus = 'DRAFT' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export type RideRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED' | 'EXPIRED' | 'COMPLETED';

export type WaypointType = 'ORIGIN' | 'CORRIDOR' | 'DESTINATION' | 'PASSENGER_STOP';

export type NotificationType =
  | 'RIDE_REQUESTED'
  | 'REQUEST_ACCEPTED'
  | 'REQUEST_REJECTED'
  | 'REQUEST_CANCELLED'
  | 'RIDE_CANCELLED'
  | 'RIDE_STARTED'
  | 'RIDE_COMPLETED'
  | 'SYSTEM_ANNOUNCEMENT';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SMS' | 'PUSH';

export type AuditAction = 'CREATE' | 'UPDATE' | 'STATE_TRANSITION' | 'DELETE' | 'CANCEL';

// ----------------------------------------------------------------------------
// Domain Entities
// ----------------------------------------------------------------------------

export interface Organization {
  id: UUID;
  name: string;
  slug: string;
  allowed_email_domains: string[];
  settings: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: UUID;
  organization_id: UUID;
  email: string;
  full_name: string;
  phone_number?: string;
  avatar_url?: string;
  status: UserStatus;
  work_department?: string;
  work_location?: string;
  created_at: string;
  updated_at: string;
}

export interface UserCapability {
  id: UUID;
  user_id: UUID;
  organization_id: UUID;
  can_ride: boolean;
  can_drive: boolean;
  is_org_admin: boolean;
  driver_verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface UserLocation {
  id: UUID;
  user_id: UUID;
  organization_id: UUID;
  label: string; // e.g. 'Home', 'HQ Campus'
  address_text: string;
  latitude: number;
  longitude: number;
  place_id?: string;
  is_default_pickup: boolean;
  is_default_drop: boolean;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: UUID;
  owner_id: UUID;
  organization_id: UUID;
  make: string;
  model: string;
  year: number;
  color: string;
  license_plate: string;
  total_seats: number;
  status: VehicleStatus;
  verified_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Ride {
  id: UUID;
  organization_id: UUID;
  driver_id: UUID;
  vehicle_id: UUID;
  status: RideStatus;
  departure_time: string;
  arrival_time_estimated: string;
  total_seats_offered: number;
  available_seats: number;
  cost_per_seat_cents: number;
  currency: string;
  notes?: string;
  cancelled_reason?: string;
  cancelled_at?: string;
  started_at?: string;
  completed_at?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface BoundingBox {
  min_lat: number;
  max_lat: number;
  min_lng: number;
  max_lng: number;
}

export interface RideRoute {
  id: UUID;
  ride_id: UUID;
  organization_id: UUID;
  origin_address: string;
  origin_latitude: number;
  origin_longitude: number;
  destination_address: string;
  destination_latitude: number;
  destination_longitude: number;
  total_distance_meters: number;
  total_duration_seconds: number;
  min_latitude: number;
  max_latitude: number;
  min_longitude: number;
  max_longitude: number;
  bounding_box: BoundingBox;
  overview_polyline?: string;
  created_at: string;
  updated_at: string;
}

export interface RouteWaypoint {
  id: UUID;
  route_id: UUID;
  organization_id: UUID;
  stop_order: number;
  point_type: WaypointType;
  address_text?: string;
  latitude: number;
  longitude: number;
  estimated_arrival_offset_seconds: number;
  created_at: string;
}

export interface PickupPoint {
  id: UUID;
  organization_id: UUID;
  passenger_id: UUID;
  address_text: string;
  latitude: number;
  longitude: number;
  landmark_note?: string;
  created_at: string;
}

export interface DropPoint {
  id: UUID;
  organization_id: UUID;
  passenger_id: UUID;
  address_text: string;
  latitude: number;
  longitude: number;
  landmark_note?: string;
  created_at: string;
}

export interface RideRequest {
  id: UUID;
  organization_id: UUID;
  ride_id: UUID;
  passenger_id: UUID;
  pickup_point_id: UUID;
  drop_point_id: UUID;
  requested_seats: number;
  status: RideRequestStatus;
  rejection_reason?: string;
  cancellation_reason?: string;
  rider_note?: string;
  responded_at?: string;
  cancelled_at?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface RidePassenger {
  id: UUID;
  organization_id: UUID;
  ride_id: UUID;
  ride_request_id: UUID;
  passenger_id: UUID;
  seats_booked: number;
  boarded_at?: string;
  dropped_off_at?: string;
  created_at: string;
}

export interface Notification {
  id: UUID;
  organization_id: UUID;
  user_id: UUID;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  payload_json: Record<string, unknown>;
  read_at?: string;
  sent_at: string;
  created_at: string;
}

export interface AuditLog {
  id: UUID;
  organization_id: UUID;
  actor_user_id?: UUID;
  entity_type: string;
  entity_id: UUID;
  action: AuditAction;
  from_state?: string;
  to_state?: string;
  metadata_json: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}
