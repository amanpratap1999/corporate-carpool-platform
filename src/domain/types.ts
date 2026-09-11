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

export type VehicleType = 'CAR' | 'MOTORCYCLE' | 'VAN';

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
  | 'SYSTEM_ANNOUNCEMENT'
  | 'USER_JOINED';

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
  // Auth fields — never returned to clients; stripped in API responses
  password_hash?: string;
  external_idp_sub?: string;
  invitation_token?: string;
  invitation_token_expires_at?: string;
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
  vehicle_type?: VehicleType;
  max_passenger_capacity?: number;
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
  encoded_polyline?: string;
  google_route_id?: string;
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

export interface LatLngPoint {
  lat: number;
  lng: number;
  address?: string;
  place_id?: string;
  stop_order?: number;
}

export interface RoutePreferences {
  avoid_tolls?: boolean;
  avoid_highways?: boolean;
  avoid_ferries?: boolean;
  routing_preference?: 'FASTER' | 'SHORTER';
}

export interface DirectionsRequestBody {
  origin?: LatLngPoint;
  destination?: LatLngPoint;
  waypoints?: LatLngPoint[];
  alternatives?: boolean;
  preferences?: RoutePreferences;
}

export interface DirectionsRouteOption {
  route_id: string;
  summary: string;
  distance: number;
  total_distance_meters: number;
  duration: number;
  total_duration_seconds: number;
  formatted_distance: string;
  formatted_duration: string;
  duration_in_traffic?: number;
  formatted_traffic_duration?: string;
  encoded_polyline?: string;
  path?: Array<{ lat: number; lng: number }>;
  is_recommended: boolean;
  warnings: string[];
  toll_metadata: {
    has_tolls: boolean;
    toll_details?: string;
  };
  has_ferries: boolean;
  has_highways: boolean;
  has_restricted_roads: boolean;
  major_road_names: string[];
  leg_details: Array<{
    distance_meters: number;
    duration_seconds: number;
    start_address: string;
    end_address: string;
  }>;
  waypoints: Array<{
    stop_order: number;
    point_type: 'ORIGIN' | 'CORRIDOR' | 'DESTINATION';
    address_text: string;
    latitude: number;
    longitude: number;
    place_id?: string;
    estimated_arrival_offset_seconds: number;
  }>;
}

export function decodePolyline(str: string): Array<{ lat: number; lng: number }> {
  let index = 0;
  const len = str.length;
  let lat = 0;
  let lng = 0;
  const coordinates: Array<{ lat: number; lng: number }> = [];

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = str.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return coordinates;
}
