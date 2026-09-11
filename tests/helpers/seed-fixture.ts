/**
 * Shared test fixture factory.
 * Creates a fresh in-memory DataStore seeded with Acme Corp data
 * matching the canonical seed IDs used throughout the test suite.
 */

import { DataStore } from '../../src/services/data-store';
import { setRepository } from '../../src/services/repository-factory';
import {
  Organization, User, UserCapability, Vehicle,
  Ride, RideRoute, RouteWaypoint, RideRequest,
} from '../../src/domain/types';

export const ORG_ID    = '11111111-1111-4111-8111-111111111111';
export const ALEX_ID   = '22222222-2222-4222-8222-222222222222'; // driver
export const SARAH_ID  = '33333333-3333-4333-8333-333333333333'; // rider
export const DAVID_ID  = '44444444-4444-4444-8444-444444444444'; // rider
export const EMILY_ID  = '55555555-5555-4555-8555-555555555555'; // driver
export const MARCUS_ID = '66666666-6666-4666-8666-666666666666'; // admin

export function makeSeedStore(): DataStore {
  const store = new DataStore();

  const org: Organization = {
    id: ORG_ID, name: 'Acme Global Corporation', slug: 'acme-corp',
    allowed_email_domains: ['@acme.com', '@acme.corp', '@acmeglobal.corp'],
    settings: { max_detour_meters: 3000, auto_complete_hours_after: 4 },
    is_active: true, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
  };
  store.organizations.set(org.id, org);

  const users: User[] = [
    { id: ALEX_ID,   organization_id: ORG_ID, full_name: 'Alex Rivera',   email: 'alex.rivera@acme.corp',   phone_number: '+14151234567', status: 'ACTIVE', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
    { id: SARAH_ID,  organization_id: ORG_ID, full_name: 'Sarah Chen',    email: 'sarah.chen@acme.corp',    phone_number: '+14159876543', status: 'ACTIVE', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
    { id: DAVID_ID,  organization_id: ORG_ID, full_name: 'David Park',    email: 'david.park@acme.corp',    phone_number: '+14151112222', status: 'ACTIVE', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
    { id: EMILY_ID,  organization_id: ORG_ID, full_name: 'Emily Johnson', email: 'emily.johnson@acme.corp', phone_number: '+14153334444', status: 'ACTIVE', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
    { id: MARCUS_ID, organization_id: ORG_ID, full_name: 'Marcus Vance',  email: 'marcus.vance@acme.com',   phone_number: '+14155556666', status: 'ACTIVE', created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
  ];
  for (const u of users) store.users.set(u.id, u);

  const caps: UserCapability[] = [
    { id: ALEX_ID,   user_id: ALEX_ID,   organization_id: ORG_ID, can_ride: true, can_drive: true,  is_org_admin: false, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
    { id: SARAH_ID,  user_id: SARAH_ID,  organization_id: ORG_ID, can_ride: true, can_drive: false, is_org_admin: false, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
    { id: DAVID_ID,  user_id: DAVID_ID,  organization_id: ORG_ID, can_ride: true, can_drive: false, is_org_admin: false, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
    { id: EMILY_ID,  user_id: EMILY_ID,  organization_id: ORG_ID, can_ride: true, can_drive: true,  is_org_admin: false, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
    { id: MARCUS_ID, user_id: MARCUS_ID, organization_id: ORG_ID, can_ride: true, can_drive: false, is_org_admin: true,  created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z' },
  ];
  for (const c of caps) store.userCapabilities.set(c.user_id, c);

  const vehicleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const vehicle: Vehicle = {
    id: vehicleId, organization_id: ORG_ID, owner_id: ALEX_ID,
    make: 'Toyota', model: 'Prius', year: 2022, color: 'Silver',
    license_plate: 'ABC1234',
    total_seats: 4, status: 'ACTIVE',
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
  };
  store.vehicles.set(vehicle.id, vehicle);

  // Ride A: Alex driving SF → Mountain View, departs at 08:15 tomorrow
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  const rideAId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const rideA: Ride = {
    id: rideAId, organization_id: ORG_ID, driver_id: ALEX_ID, vehicle_id: vehicleId,
    status: 'SCHEDULED',
    departure_time: `${tomorrowStr}T08:15:00Z`,
    arrival_time_estimated: `${tomorrowStr}T09:30:00Z`,
    total_seats_offered: 3, available_seats: 2,
    cost_per_seat_cents: 0, currency: 'USD',
    version: 1, created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
  };
  store.rides.set(rideA.id, rideA);

  const routeAId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const routeA: RideRoute = {
    id: routeAId, ride_id: rideAId, organization_id: ORG_ID,
    origin_address: '123 Market St, San Francisco, CA',
    origin_latitude: 37.7749, origin_longitude: -122.4194,
    destination_address: '1600 Amphitheatre Pkwy, Mountain View, CA',
    destination_latitude: 37.422, destination_longitude: -122.0841,
    total_distance_meters: 55000, total_duration_seconds: 3300,
    min_latitude: 37.422, max_latitude: 37.7749,
    min_longitude: -122.4194, max_longitude: -122.0841,
    bounding_box: { min_lat: 37.422, max_lat: 37.7749, min_lng: -122.4194, max_lng: -122.0841 },
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
  };
  store.rideRoutes.set(routeA.id, routeA);

  const waypointsA: RouteWaypoint[] = [
    { id: 'wp-a-0', route_id: routeAId, organization_id: ORG_ID, stop_order: 0, point_type: 'ORIGIN', estimated_arrival_offset_seconds: 0,      address_text: 'SF Market St',   latitude: 37.7749,  longitude: -122.4194,  created_at: '2026-08-01T00:00:00Z' },
    { id: 'wp-a-1', route_id: routeAId, organization_id: ORG_ID, stop_order: 1, point_type: 'CORRIDOR', estimated_arrival_offset_seconds: 900,    address_text: 'Millbrae BART',  latitude: 37.5997,  longitude: -122.3867,  created_at: '2026-08-01T00:00:00Z' },
    { id: 'wp-a-2', route_id: routeAId, organization_id: ORG_ID, stop_order: 2, point_type: 'DESTINATION', estimated_arrival_offset_seconds: 3300, address_text: 'Mountain View',  latitude: 37.422,   longitude: -122.0841,  created_at: '2026-08-01T00:00:00Z' },
  ];
  for (const w of waypointsA) store.routeWaypoints.set(w.id, w);

  // A seeded ride request (Sarah requesting to join Alex's ride)
  const reqId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const rideRequest: RideRequest = {
    id: reqId, organization_id: ORG_ID, ride_id: rideAId,
    passenger_id: SARAH_ID, pickup_point_id: 'pp-1', drop_point_id: 'dp-1',
    requested_seats: 1, status: 'PENDING', version: 1,
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
  };
  store.rideRequests.set(rideRequest.id, rideRequest);

  return store;
}

/** Creates a fresh seeded store, injects it via setRepository(), and returns it. */
export function setupTestRepository(): DataStore {
  const store = makeSeedStore();
  setRepository(store);
  return store;
}
