/**
 * Pre-seeds realistic enterprise data into DataStore
 * Matches Acme Global corporate tenant setup
 */

import { PostgresStore } from './postgres-store';
import {
  Organization,
  User,
  UserCapability,
  UserLocation,
  Vehicle,
  Ride,
  RideRoute,
  RouteWaypoint,
  PickupPoint,
  DropPoint,
  RideRequest,
  RidePassenger,
} from '../domain/types';

export async function initializeSeedData(): Promise<PostgresStore> {
  const store = PostgresStore.getInstance();
  const orgs = await store.getAllOrganizations();
  if (orgs.length > 0) return store; // Already seeded

  const orgId = '11111111-1111-4111-8111-111111111111';

  // 1. Organization
  const org: Organization = {
    id: orgId,
    name: 'Acme Global Corporation',
    slug: 'acme-corp',
    allowed_email_domains: ['@acme.com', '@acmeglobal.corp'],
    settings: {
      max_detour_meters: 3000,
      auto_complete_hours_after: 4,
    },
    is_active: true,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
  };
  await store.setOrganization(org);

  // 2. Users
  const alexId = '22222222-2222-4222-8222-222222222222';
  const sarahId = '33333333-3333-4333-8333-333333333333';
  const davidId = '44444444-4444-4444-8444-444444444444';
  const emilyId = '55555555-5555-4555-8555-555555555555';
  const marcusId = '66666666-6666-4666-8666-666666666666';

  const users: User[] = [
    {
      id: alexId,
      organization_id: orgId,
      email: 'alex.rivera@acme.com',
      full_name: 'Alex Rivera',
      phone_number: '+1 (415) 555-0101',
      status: 'ACTIVE',
      work_department: 'Core Infrastructure',
      work_location: 'HQ Campus - Building C',
      created_at: '2026-08-10T09:00:00Z',
      updated_at: '2026-08-10T09:00:00Z',
    },
    {
      id: sarahId,
      organization_id: orgId,
      email: 'sarah.chen@acme.com',
      full_name: 'Sarah Chen',
      phone_number: '+1 (510) 555-0122',
      status: 'ACTIVE',
      work_department: 'Product Management',
      work_location: 'HQ Campus - Building A',
      created_at: '2026-08-12T10:00:00Z',
      updated_at: '2026-08-12T10:00:00Z',
    },
    {
      id: davidId,
      organization_id: orgId,
      email: 'david.kim@acme.com',
      full_name: 'David Kim',
      phone_number: '+1 (650) 555-0144',
      status: 'ACTIVE',
      work_department: 'Data & Analytics',
      work_location: 'HQ Campus - Building B',
      created_at: '2026-08-15T11:00:00Z',
      updated_at: '2026-08-15T11:00:00Z',
    },
    {
      id: emilyId,
      organization_id: orgId,
      email: 'emily.watson@acme.com',
      full_name: 'Emily Watson',
      phone_number: '+1 (650) 555-0188',
      status: 'ACTIVE',
      work_department: 'Design & UX',
      work_location: 'HQ Campus - Building A',
      created_at: '2026-08-16T14:00:00Z',
      updated_at: '2026-08-16T14:00:00Z',
    },
    {
      id: marcusId,
      organization_id: orgId,
      email: 'marcus.vance@acme.com',
      full_name: 'Marcus Vance',
      phone_number: '+1 (408) 555-0199',
      status: 'ACTIVE',
      work_department: 'Workplace & Operations',
      work_location: 'HQ Campus - Facilities',
      created_at: '2026-08-01T08:00:00Z',
      updated_at: '2026-08-01T08:00:00Z',
    },
  ];

  for (const u of users) await store.setUser(u);

  // 3. User Capabilities
  const capabilities: UserCapability[] = [
    {
      id: crypto.randomUUID(),
      user_id: alexId,
      organization_id: orgId,
      can_ride: true,
      can_drive: true,
      is_org_admin: false,
      driver_verified_at: '2026-08-11T12:00:00Z',
      created_at: '2026-08-10T09:00:00Z',
      updated_at: '2026-08-11T12:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      user_id: sarahId,
      organization_id: orgId,
      can_ride: true,
      can_drive: true,
      is_org_admin: false,
      driver_verified_at: '2026-08-13T14:00:00Z',
      created_at: '2026-08-12T10:00:00Z',
      updated_at: '2026-08-13T14:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      user_id: davidId,
      organization_id: orgId,
      can_ride: true,
      can_drive: false,
      is_org_admin: false,
      created_at: '2026-08-15T11:00:00Z',
      updated_at: '2026-08-15T11:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      user_id: emilyId,
      organization_id: orgId,
      can_ride: true,
      can_drive: false,
      is_org_admin: false,
      created_at: '2026-08-16T14:00:00Z',
      updated_at: '2026-08-16T14:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      user_id: marcusId,
      organization_id: orgId,
      can_ride: true,
      can_drive: false,
      is_org_admin: true,
      created_at: '2026-08-01T08:00:00Z',
      updated_at: '2026-08-01T08:00:00Z',
    },
  ];
  for (const c of capabilities) await store.setUserCapability(c);

  // 4. Saved Locations
  const locations: UserLocation[] = [
    {
      id: crypto.randomUUID(),
      user_id: alexId,
      organization_id: orgId,
      label: 'Home (Mission Dolores)',
      address_text: '450 Dolores St, San Francisco, CA',
      latitude: 37.7615,
      longitude: -122.426,
      is_default_pickup: true,
      is_default_drop: false,
      created_at: '2026-08-10T10:00:00Z',
      updated_at: '2026-08-10T10:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      user_id: davidId,
      organization_id: orgId,
      label: 'Home (Millbrae BART)',
      address_text: '100 California Dr, Millbrae, CA',
      latitude: 37.5997,
      longitude: -122.3867,
      is_default_pickup: true,
      is_default_drop: false,
      created_at: '2026-08-15T12:00:00Z',
      updated_at: '2026-08-15T12:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      user_id: emilyId,
      organization_id: orgId,
      label: 'Home (San Mateo Downtown)',
      address_text: '300 S El Camino Real, San Mateo, CA',
      latitude: 37.563,
      longitude: -122.3255,
      is_default_pickup: true,
      is_default_drop: false,
      created_at: '2026-08-16T15:00:00Z',
      updated_at: '2026-08-16T15:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      user_id: alexId,
      organization_id: orgId,
      label: 'Acme HQ Tech Campus',
      address_text: '1600 Amphitheatre Pkwy, Mountain View, CA',
      latitude: 37.422,
      longitude: -122.0841,
      is_default_pickup: false,
      is_default_drop: true,
      created_at: '2026-08-10T10:00:00Z',
      updated_at: '2026-08-10T10:00:00Z',
    },
  ];
  for (const l of locations) await store.setUserLocation(l);

  // 5. Vehicles
  const alexVehId = '77777777-7777-4777-8777-777777777777';
  const sarahVehId = '88888888-8888-4888-8888-888888888888';

  const vehicles: Vehicle[] = [
    {
      id: alexVehId,
      owner_id: alexId,
      organization_id: orgId,
      make: 'Tesla',
      model: 'Model 3 Dual Motor',
      year: 2023,
      color: 'Pearl White',
      license_plate: '8XYZ789',
      total_seats: 5,
      status: 'ACTIVE',
      verified_at: '2026-08-11T12:00:00Z',
      created_at: '2026-08-11T09:00:00Z',
      updated_at: '2026-08-11T12:00:00Z',
    },
    {
      id: sarahVehId,
      owner_id: sarahId,
      organization_id: orgId,
      make: 'Toyota',
      model: 'RAV4 Hybrid XSE',
      year: 2024,
      color: 'Magnetic Gray',
      license_plate: '7ABC123',
      total_seats: 5,
      status: 'ACTIVE',
      verified_at: '2026-08-13T14:00:00Z',
      created_at: '2026-08-13T10:00:00Z',
      updated_at: '2026-08-13T14:00:00Z',
    },
  ];
  for (const v of vehicles) await store.setVehicle(v);

  // 6. Ride 1: Alex's Inbound Commute
  const ride1Id = '99999999-9999-4999-8999-999999999999';
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowDateStr = tomorrow.toISOString().split('T')[0];

  const depTime1 = `${tomorrowDateStr}T08:15:00Z`;
  const arrTime1 = `${tomorrowDateStr}T09:05:00Z`;

  const ride1: Ride = {
    id: ride1Id,
    organization_id: orgId,
    driver_id: alexId,
    vehicle_id: alexVehId,
    status: 'SCHEDULED',
    departure_time: depTime1,
    arrival_time_estimated: arrTime1,
    total_seats_offered: 3,
    available_seats: 2, // 1 seat reserved by David Kim
    cost_per_seat_cents: 350,
    currency: 'USD',
    notes: 'Leaving on time. AC on, non-smoking, podcast on low volume.',
    version: 2,
    created_at: '2026-09-09T08:00:00Z',
    updated_at: '2026-09-09T09:30:00Z',
  };
  await store.setRide(ride1);

  // Route 1
  const route1Id = crypto.randomUUID();
  const route1: RideRoute = {
    id: route1Id,
    ride_id: ride1Id,
    organization_id: orgId,
    origin_address: '450 Dolores St, San Francisco, CA',
    origin_latitude: 37.7615,
    origin_longitude: -122.426,
    destination_address: 'Acme HQ Tech Campus, Mountain View, CA',
    destination_latitude: 37.422,
    destination_longitude: -122.0841,
    total_distance_meters: 53200,
    total_duration_seconds: 3000,
    min_latitude: 37.422,
    max_latitude: 37.7615,
    min_longitude: -122.426,
    max_longitude: -122.0841,
    bounding_box: {
      min_lat: 37.422,
      max_lat: 37.7615,
      min_lng: -122.426,
      max_lng: -122.0841,
    },
    created_at: '2026-09-09T08:00:00Z',
    updated_at: '2026-09-09T08:00:00Z',
  };
  await store.setRideRoute(route1);

  // Route 1 Waypoints
  const waypoints1: RouteWaypoint[] = [
    {
      id: crypto.randomUUID(),
      route_id: route1Id,
      organization_id: orgId,
      stop_order: 0,
      point_type: 'ORIGIN',
      address_text: 'SF Mission Dolores',
      latitude: 37.7615,
      longitude: -122.426,
      estimated_arrival_offset_seconds: 0,
      created_at: '2026-09-09T08:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      route_id: route1Id,
      organization_id: orgId,
      stop_order: 1,
      point_type: 'CORRIDOR',
      address_text: 'Millbrae BART Station East Canopy',
      latitude: 37.5997,
      longitude: -122.3867,
      estimated_arrival_offset_seconds: 900,
      created_at: '2026-09-09T08:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      route_id: route1Id,
      organization_id: orgId,
      stop_order: 2,
      point_type: 'CORRIDOR',
      address_text: 'San Mateo 101 / 3rd Ave Interchange',
      latitude: 37.566,
      longitude: -122.316,
      estimated_arrival_offset_seconds: 1500,
      created_at: '2026-09-09T08:00:00Z',
    },
    {
      id: crypto.randomUUID(),
      route_id: route1Id,
      organization_id: orgId,
      stop_order: 3,
      point_type: 'DESTINATION',
      address_text: 'Acme HQ Building C Gate',
      latitude: 37.422,
      longitude: -122.0841,
      estimated_arrival_offset_seconds: 3000,
      created_at: '2026-09-09T08:00:00Z',
    },
  ];
  for (const w of waypoints1) await store.setRouteWaypoint(w);

  // Request 1: David Kim (ACCEPTED)
  const davidPickupId = crypto.randomUUID();
  const davidDropId = crypto.randomUUID();
  await store.setPickupPoint({
    id: davidPickupId,
    organization_id: orgId,
    passenger_id: davidId,
    address_text: 'Millbrae BART Station Plaza',
    latitude: 37.5997,
    longitude: -122.3867,
    landmark_note: 'Waiting near the taxi turnaround',
    created_at: '2026-09-09T09:00:00Z',
  });
  await store.setDropPoint({
    id: davidDropId,
    organization_id: orgId,
    passenger_id: davidId,
    address_text: 'Acme HQ Tech Campus - Building B',
    latitude: 37.422,
    longitude: -122.0841,
    landmark_note: 'North entrance turnstiles',
    created_at: '2026-09-09T09:00:00Z',
  });

  const davidReqId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const davidReq: RideRequest = {
    id: davidReqId,
    organization_id: orgId,
    ride_id: ride1Id,
    passenger_id: davidId,
    pickup_point_id: davidPickupId,
    drop_point_id: davidDropId,
    requested_seats: 1,
    status: 'ACCEPTED',
    rider_note: 'Thanks Alex! Will be waiting right at 8:30 AM at the taxi loop.',
    responded_at: '2026-09-09T09:30:00Z',
    version: 2,
    created_at: '2026-09-09T09:00:00Z',
    updated_at: '2026-09-09T09:30:00Z',
  };
  await store.setRideRequest(davidReq);

  // Manifest entry
  const manifest1: RidePassenger = {
    id: crypto.randomUUID(),
    organization_id: orgId,
    ride_id: ride1Id,
    ride_request_id: davidReqId,
    passenger_id: davidId,
    seats_booked: 1,
    created_at: '2026-09-09T09:30:00Z',
  };
  await store.setRidePassenger(manifest1);

  // Request 2: Emily Watson (PENDING)
  const emilyPickupId = crypto.randomUUID();
  const emilyDropId = crypto.randomUUID();
  await store.setPickupPoint({
    id: emilyPickupId,
    organization_id: orgId,
    passenger_id: emilyId,
    address_text: '300 S El Camino Real, San Mateo',
    latitude: 37.563,
    longitude: -122.3255,
    landmark_note: 'In front of Starbucks',
    created_at: '2026-09-09T10:15:00Z',
  });
  await store.setDropPoint({
    id: emilyDropId,
    organization_id: orgId,
    passenger_id: emilyId,
    address_text: 'Acme HQ Building A Gate',
    latitude: 37.422,
    longitude: -122.0841,
    created_at: '2026-09-09T10:15:00Z',
  });

  const emilyReqId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const emilyReq: RideRequest = {
    id: emilyReqId,
    organization_id: orgId,
    ride_id: ride1Id,
    passenger_id: emilyId,
    pickup_point_id: emilyPickupId,
    drop_point_id: emilyDropId,
    requested_seats: 1,
    status: 'PENDING',
    rider_note: 'Hi Alex, I have a morning product review at 9:15 AM, hope to catch a seat!',
    version: 1,
    created_at: '2026-09-09T10:15:00Z',
    updated_at: '2026-09-09T10:15:00Z',
  };
  await store.setRideRequest(emilyReq);

  // Initial Notifications
  await store.dispatchNotification(
    orgId,
    alexId,
    'RIDE_REQUESTED',
    'New Seat Request from Emily Watson',
    'Emily requested 1 seat on your morning commute from San Mateo.',
    { ride_id: ride1Id, request_id: emilyReqId }
  );

  await store.dispatchNotification(
    orgId,
    davidId,
    'REQUEST_ACCEPTED',
    'Ride Request Confirmed!',
    'Alex confirmed your seat for tomorrow at 8:30 AM.',
    { ride_id: ride1Id, request_id: davidReqId }
  );

  // Initial Audit Logs
  await store.logAudit(orgId, alexId, 'RIDE', ride1Id, 'CREATE', undefined, 'SCHEDULED', {
    departure_time: depTime1,
    total_seats: 3,
  });
  await store.logAudit(orgId, davidId, 'RIDE_REQUEST', davidReqId, 'CREATE', undefined, 'PENDING');
  await store.logAudit(orgId, alexId, 'RIDE_REQUEST', davidReqId, 'STATE_TRANSITION', 'PENDING', 'ACCEPTED', {
    seats_booked: 1,
  });
  await store.logAudit(orgId, emilyId, 'RIDE_REQUEST', emilyReqId, 'CREATE', undefined, 'PENDING');

  return store;
}
