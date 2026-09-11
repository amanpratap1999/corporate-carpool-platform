import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { JwtAuthProvider } from '../../src/infrastructure/auth/jwt-auth-provider';
import { setAuthProvider } from '../../src/infrastructure/auth/auth-factory';
import { DataStore } from '../../src/services/data-store';
import { setRepository } from '../../src/services/repository-factory';
import { Organization, User, UserCapability, Vehicle, Ride } from '../../src/domain/types';

import { GET as getVehiclesHandler } from '../../src/app/api/v1/admin/vehicles/route';
import { DELETE as deleteVehicleHandler } from '../../src/app/api/v1/admin/vehicles/[id]/route';
import { POST as publishRideHandler } from '../../src/app/api/v1/rides/route';

const ORG_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '22222222-2222-4222-8222-222222222222';
const DRIVER_ID = '33333333-3333-4333-8333-333333333333';

const VEHICLE_ACTIVE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const VEHICLE_BUSY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const RIDE_ACTIVE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function makeStore(): DataStore {
  const store = new DataStore();

  const org: Organization = {
    id: ORG_ID,
    name: 'Acme Corp',
    slug: 'acme-corp',
    allowed_email_domains: ['@acme.com'],
    settings: { max_detour_meters: 3000 },
    is_active: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
  store.organizations.set(org.id, org);

  const admin: User = {
    id: ADMIN_ID,
    organization_id: ORG_ID,
    full_name: 'Marcus Vance',
    email: 'marcus.vance@acme.com',
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  const driver: User = {
    id: DRIVER_ID,
    organization_id: ORG_ID,
    full_name: 'Alex Rivera',
    email: 'alex.rivera@acme.com',
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  store.users.set(admin.id, admin);
  store.users.set(driver.id, driver);

  store.userCapabilities.set(ADMIN_ID, {
    id: ADMIN_ID,
    user_id: ADMIN_ID,
    organization_id: ORG_ID,
    can_ride: true,
    can_drive: false,
    is_org_admin: true,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });

  store.userCapabilities.set(DRIVER_ID, {
    id: DRIVER_ID,
    user_id: DRIVER_ID,
    organization_id: ORG_ID,
    can_ride: true,
    can_drive: true,
    is_org_admin: false,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  });

  // Free vehicle
  const vehicleActive: Vehicle = {
    id: VEHICLE_ACTIVE_ID,
    organization_id: ORG_ID,
    owner_id: DRIVER_ID,
    make: 'Toyota',
    model: 'Prius',
    year: 2022,
    color: 'Silver',
    license_plate: 'PRIUS01',
    total_seats: 5,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  // Busy vehicle (assigned to scheduled ride)
  const vehicleBusy: Vehicle = {
    id: VEHICLE_BUSY_ID,
    organization_id: ORG_ID,
    owner_id: DRIVER_ID,
    make: 'Tesla',
    model: 'Model Y',
    year: 2023,
    color: 'Red',
    license_plate: 'TESLA99',
    total_seats: 5,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };

  store.vehicles.set(vehicleActive.id, vehicleActive);
  store.vehicles.set(vehicleBusy.id, vehicleBusy);

  // Active scheduled ride using vehicleBusy
  const activeRide: Ride = {
    id: RIDE_ACTIVE_ID,
    organization_id: ORG_ID,
    driver_id: DRIVER_ID,
    vehicle_id: VEHICLE_BUSY_ID,
    status: 'SCHEDULED',
    departure_time: '2026-09-12T08:00:00Z',
    arrival_time_estimated: '2026-09-12T09:00:00Z',
    total_seats_offered: 3,
    available_seats: 3,
    cost_per_seat_cents: 0,
    currency: 'USD',
    version: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
  store.rides.set(activeRide.id, activeRide);

  return store;
}

describe('Admin Vehicle Management & Conflict Resolution', () => {
  const secret = 'vehicle-mgmt-secret-at-least-32-chars!';
  let jwtProvider: JwtAuthProvider;
  let store: DataStore;
  let adminToken: string;
  let driverToken: string;

  beforeEach(async () => {
    jwtProvider = new JwtAuthProvider(secret, 'carpool-test');
    setAuthProvider(jwtProvider);
    store = makeStore();
    setRepository(store);

    adminToken = await jwtProvider.signToken({
      userId: ADMIN_ID,
      organizationId: ORG_ID,
      email: 'marcus.vance@acme.com',
      capabilities: { can_ride: true, can_drive: false, is_org_admin: true },
    });

    driverToken = await jwtProvider.signToken({
      userId: DRIVER_ID,
      organizationId: ORG_ID,
      email: 'alex.rivera@acme.com',
      capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
    });
  });

  afterEach(() => {
    setRepository(null);
    setAuthProvider(null);
  });

  it('GET /api/v1/admin/vehicles returns enriched vehicles with owner name and email', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/admin/vehicles', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const res = await getVehiclesHandler(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.vehicles.length).toBe(2);

    const prius = data.vehicles.find((v: any) => v.id === VEHICLE_ACTIVE_ID);
    expect(prius).toBeDefined();
    expect(prius.owner_name).toBe('Alex Rivera');
    expect(prius.owner_email).toBe('alex.rivera@acme.com');
  });

  it('DELETE /api/v1/admin/vehicles/:id returns 409 Conflict if vehicle is in an active ride', async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/admin/vehicles/${VEHICLE_BUSY_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const res = await deleteVehicleHandler(req, { params: Promise.resolve({ id: VEHICLE_BUSY_ID }) });
    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe('ERR_VEHICLE_IN_USE');

    // Verify vehicle remains ACTIVE in store
    const v = await store.getVehicle(VEHICLE_BUSY_ID);
    expect(v?.status).toBe('ACTIVE');
  });

  it('DELETE /api/v1/admin/vehicles/:id soft-deactivates vehicle and creates audit log when no active rides exist', async () => {
    const req = new NextRequest(`http://localhost:3000/api/v1/admin/vehicles/${VEHICLE_ACTIVE_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const res = await deleteVehicleHandler(req, { params: Promise.resolve({ id: VEHICLE_ACTIVE_ID }) });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.vehicle.status).toBe('INACTIVE');

    // Verify vehicle in store is INACTIVE
    const v = await store.getVehicle(VEHICLE_ACTIVE_ID);
    expect(v?.status).toBe('INACTIVE');

    // Verify audit log
    const auditLogs = await store.getAllAuditLogs();
    const deactLog = auditLogs.find(
      (l) => l.entity_id === VEHICLE_ACTIVE_ID && l.action === 'STATE_TRANSITION'
    );
    expect(deactLog).toBeDefined();
    expect(deactLog?.from_state).toBe('ACTIVE');
    expect(deactLog?.to_state).toBe('INACTIVE');
  });

  it('DELETE /api/v1/admin/vehicles/:id returns 400 Bad Request when attempting to re-deactivate an inactive vehicle', async () => {
    // Deactivate first
    const v = await store.getVehicle(VEHICLE_ACTIVE_ID);
    await store.setVehicle({ ...v!, status: 'INACTIVE' });

    const req = new NextRequest(`http://localhost:3000/api/v1/admin/vehicles/${VEHICLE_ACTIVE_ID}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const res = await deleteVehicleHandler(req, { params: Promise.resolve({ id: VEHICLE_ACTIVE_ID }) });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('ERR_VEHICLE_ALREADY_INACTIVE');
  });

  it('POST /api/v1/rides rejects ride publishing when the selected vehicle is INACTIVE', async () => {
    // Set vehicleActive to INACTIVE
    const v = await store.getVehicle(VEHICLE_ACTIVE_ID);
    await store.setVehicle({ ...v!, status: 'INACTIVE' });

    const ridePayload = {
      vehicle_id: VEHICLE_ACTIVE_ID,
      departure_time: '2026-09-15T08:30:00Z',
      arrival_time_estimated: '2026-09-15T09:15:00Z',
      total_seats_offered: 2,
      cost_per_seat_cents: 0,
      notes: 'Commute with inactive car',
      route: {
        origin_address: '100 Main St, SF',
        origin_latitude: 37.7749,
        origin_longitude: -122.4194,
        destination_address: '1600 Amphitheatre Pkwy, Mountain View',
        destination_latitude: 37.422,
        destination_longitude: -122.0841,
        total_distance_meters: 50000,
        total_duration_seconds: 3000,
        waypoints: [],
      },
    };

    const req = new NextRequest('http://localhost:3000/api/v1/rides', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driverToken}`,
      },
      body: JSON.stringify(ridePayload),
    });

    const res = await publishRideHandler(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe('ERR_VEHICLE_INACTIVE');
  });
});
