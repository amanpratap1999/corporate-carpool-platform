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
  PickupPoint, DropPoint,
} from '../../src/domain/types';

export const ORG_ID    = '11111111-1111-4111-8111-111111111111';
export const ALEX_ID   = '22222222-2222-4222-8222-222222222222'; // driver
export const SARAH_ID  = '33333333-3333-4333-8333-333333333333'; // rider
export const DAVID_ID  = '44444444-4444-4444-8444-444444444444'; // rider
export const EMILY_ID  = '55555555-5555-4555-8555-555555555555'; // driver
export const MARCUS_ID = '66666666-6666-4666-8666-666666666666'; // admin
export const VEHICLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const RIDE_A_ID  = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const ROUTE_A_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const REQ_ID     = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
export const PICKUP_ID  = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
export const DROP_ID    = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

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
    { id: '66666666-0000-4000-8000-000000000000', route_id: routeAId, organization_id: ORG_ID, stop_order: 0, point_type: 'ORIGIN', estimated_arrival_offset_seconds: 0,      address_text: 'SF Market St',   latitude: 37.7749,  longitude: -122.4194,  created_at: '2026-08-01T00:00:00Z' },
    { id: '66666666-0000-4000-8000-000000000001', route_id: routeAId, organization_id: ORG_ID, stop_order: 1, point_type: 'CORRIDOR', estimated_arrival_offset_seconds: 900,    address_text: 'Millbrae BART',  latitude: 37.5997,  longitude: -122.3867,  created_at: '2026-08-01T00:00:00Z' },
    { id: '66666666-0000-4000-8000-000000000002', route_id: routeAId, organization_id: ORG_ID, stop_order: 2, point_type: 'DESTINATION', estimated_arrival_offset_seconds: 3300, address_text: 'Mountain View',  latitude: 37.422,   longitude: -122.0841,  created_at: '2026-08-01T00:00:00Z' },
  ];
  for (const w of waypointsA) store.routeWaypoints.set(w.id, w);

  const pickupPoint: PickupPoint = {
    id: PICKUP_ID, organization_id: ORG_ID, passenger_id: SARAH_ID,
    address_text: 'SF Market St', latitude: 37.7749, longitude: -122.4194,
    created_at: '2026-08-01T00:00:00Z',
  };
  store.pickupPoints.set(pickupPoint.id, pickupPoint);

  const dropPoint: DropPoint = {
    id: DROP_ID, organization_id: ORG_ID, passenger_id: SARAH_ID,
    address_text: 'Mountain View', latitude: 37.422, longitude: -122.0841,
    created_at: '2026-08-01T00:00:00Z',
  };
  store.dropPoints.set(dropPoint.id, dropPoint);

  // A seeded ride request (Sarah requesting to join Alex's ride)
  const reqId = REQ_ID;
  const rideRequest: RideRequest = {
    id: reqId, organization_id: ORG_ID, ride_id: rideAId,
    passenger_id: SARAH_ID, pickup_point_id: PICKUP_ID, drop_point_id: DROP_ID,
    requested_seats: 1, status: 'PENDING', version: 1,
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
  };
  store.rideRequests.set(rideRequest.id, rideRequest);

  return store;
}

import { readFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getDb, isPgliteUrl, getPglite } from '../../src/infrastructure/db/client';
import { PostgresStore } from '../../src/services/postgres-store';
import { sql } from 'drizzle-orm';
import type { IDataRepository } from '../../src/services/repository.interface';

/**
 * Sets up a real PostgreSQL or PGlite database:
 * 1. Runs all SQL migrations in order from migrations/_journal.json.
 * 2. Clears existing data.
 * 3. Seeds the canonical Acme Corp dataset using PostgresStore.
 * 4. Injects PostgresStore into the repository factory.
 */
export async function setupDatabaseTestRepository(): Promise<PostgresStore> {
  const db = getDb();
  if (!db) {
    throw new Error('Database connection failed for DATABASE_URL: ' + process.env.DATABASE_URL);
  }

  const repoRoot = process.cwd();
  const migrationsFolder = join(repoRoot, 'migrations');
  const journalPath = join(migrationsFolder, 'meta', '_journal.json');

  if (existsSync(journalPath)) {
    const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
    const pglite = getPglite();
    for (const entry of journal.entries) {
      const sqlFile = join(migrationsFolder, `${entry.tag}.sql`);
      if (existsSync(sqlFile)) {
        let content = readFileSync(sqlFile, 'utf8');
        if (isPgliteUrl(process.env.DATABASE_URL)) {
          content = content.replace(/CREATE EXTENSION[^\n;]+;/gi, '-- $&');
        }
        try {
          if (pglite) {
            await pglite.exec(content);
          } else {
            await db.execute(sql.raw(content));
          }
        } catch (e: any) {
          if (!e.message?.includes('already exists')) {
            console.warn(`Migration notice on ${entry.tag}:`, e.message);
          }
        }
      }
    }
  }

  // Clear existing rows
  try {
    const pglite = getPglite();
    const cleanSql = `
      DELETE FROM ride_passengers;
      DELETE FROM ride_requests;
      DELETE FROM route_waypoints;
      DELETE FROM ride_routes;
      DELETE FROM rides;
      DELETE FROM vehicles;
      DELETE FROM user_capabilities;
      DELETE FROM users;
      DELETE FROM organizations;
      DELETE FROM rate_limits;
    `;
    if (pglite) {
      await pglite.exec(cleanSql);
    } else {
      await db.execute(sql.raw(cleanSql));
    }
  } catch {
    // Tables may be empty initially
  }

  const pgStore = PostgresStore.getInstance();
  setRepository(pgStore);

  // Seed canonical test data directly into Postgres
  const seedStore = makeSeedStore();

  for (const org of seedStore.organizations.values()) {
    await pgStore.setOrganization(org);
  }
  for (const user of seedStore.users.values()) {
    await pgStore.setUser(user);
  }
  for (const cap of seedStore.userCapabilities.values()) {
    await pgStore.setUserCapability(cap);
  }
  for (const veh of seedStore.vehicles.values()) {
    await pgStore.setVehicle(veh);
  }
  for (const ride of seedStore.rides.values()) {
    await pgStore.setRide(ride);
  }
  for (const route of seedStore.rideRoutes.values()) {
    await pgStore.setRideRoute(route);
  }
  for (const wp of seedStore.routeWaypoints.values()) {
    await pgStore.setRouteWaypoint(wp);
  }
  for (const pp of seedStore.pickupPoints.values()) {
    await pgStore.setPickupPoint(pp);
  }
  for (const dp of seedStore.dropPoints.values()) {
    await pgStore.setDropPoint(dp);
  }
  for (const req of seedStore.rideRequests.values()) {
    await pgStore.setRideRequest(req);
  }

  return pgStore;
}

/** Creates a fresh seeded in-memory store, injects it via setRepository(), and returns it. */
export function setupTestRepository(): DataStore {
  const store = makeSeedStore();
  setRepository(store);
  return store;
}

