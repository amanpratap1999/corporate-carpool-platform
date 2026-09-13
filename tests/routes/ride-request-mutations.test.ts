import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as cancelRoute } from '../../src/app/api/v1/ride-requests/[id]/cancel/route';
import { POST as rejectRoute } from '../../src/app/api/v1/ride-requests/[id]/reject/route';
import { DataStore } from '../../src/services/data-store';
import { setRepository } from '../../src/services/repository-factory';
import { JwtAuthProvider } from '../../src/infrastructure/auth/jwt-auth-provider';
import { setAuthProvider } from '../../src/infrastructure/auth/auth-factory';
import type { Organization, User, UserCapability, Ride, RideRequest } from '../../src/domain/types';

const TEST_SECRET = 'test-secret-at-least-32-characters-long!';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const DRIVER_ID = '22222222-2222-4222-8222-222222222222';
const PASSENGER_ID = '33333333-3333-4333-8333-333333333333';
const STRANGER_ID = '44444444-4444-4444-8444-444444444444';
const RIDE_ID = '55555555-5555-4555-8555-555555555555';
const REQUEST_ID = '66666666-6666-4666-8666-666666666666';

describe('Ride Request Mutation Routes (cancel and reject)', () => {
  let store: DataStore;
  let authProvider: JwtAuthProvider;

  beforeEach(() => {
    store = new DataStore();
    setRepository(store);

    authProvider = new JwtAuthProvider(TEST_SECRET, 'carpool-api');
    setAuthProvider(authProvider);

    const org: Organization = {
      id: ORG_ID,
      name: 'Acme Corp',
      slug: 'acme-corp',
      allowed_email_domains: ['@acme.corp'],
      settings: {},
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.organizations.set(org.id, org);

    const driver: User = {
      id: DRIVER_ID,
      organization_id: ORG_ID,
      email: 'driver@acme.corp',
      full_name: 'Dave Driver',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const passenger: User = {
      id: PASSENGER_ID,
      organization_id: ORG_ID,
      email: 'passenger@acme.corp',
      full_name: 'Pam Passenger',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const stranger: User = {
      id: STRANGER_ID,
      organization_id: ORG_ID,
      email: 'stranger@acme.corp',
      full_name: 'Sam Stranger',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.users.set(driver.id, driver);
    store.users.set(passenger.id, passenger);
    store.users.set(stranger.id, stranger);

    const capBase: Omit<UserCapability, 'id' | 'user_id'> = {
      organization_id: ORG_ID,
      can_ride: true,
      can_drive: true,
      is_org_admin: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.userCapabilities.set(driver.id, { id: 'cap-1', user_id: driver.id, ...capBase });
    store.userCapabilities.set(passenger.id, { id: 'cap-2', user_id: passenger.id, ...capBase });
    store.userCapabilities.set(stranger.id, { id: 'cap-3', user_id: stranger.id, ...capBase });

    const ride: Ride = {
      id: RIDE_ID,
      organization_id: ORG_ID,
      driver_id: DRIVER_ID,
      vehicle_id: crypto.randomUUID(),
      departure_time: new Date(Date.now() + 3600000).toISOString(),
      arrival_time_estimated: new Date(Date.now() + 7200000).toISOString(),
      total_seats_offered: 3,
      available_seats: 2,
      cost_per_seat_cents: 100,
      currency: 'USD',
      status: 'SCHEDULED',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.rides.set(ride.id, ride);

    const request: RideRequest = {
      id: REQUEST_ID,
      organization_id: ORG_ID,
      ride_id: RIDE_ID,
      passenger_id: PASSENGER_ID,
      pickup_point_id: crypto.randomUUID(),
      drop_point_id: crypto.randomUUID(),
      requested_seats: 1,
      status: 'PENDING',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.rideRequests.set(request.id, request);
  });

  async function makeAuthedRequest(url: string, userId: string, body?: any): Promise<NextRequest> {
    const token = await authProvider.generateToken({
      userId,
      orgId: ORG_ID,
      role: 'user',
    });
    return new NextRequest(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  it('cancel route awaits store.cancelRideRequest and returns resolved object', async () => {
    const req = await makeAuthedRequest(
      `http://localhost/api/v1/ride-requests/${REQUEST_ID}/cancel`,
      PASSENGER_ID,
      { reason: 'Change of plans' }
    );
    const res = await cancelRoute(req, { params: Promise.resolve({ id: REQUEST_ID }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty('request');
    expect(data).toHaveProperty('ride');
    expect(data.request.id).toBe(REQUEST_ID);
    expect(data.request.status).toBe('CANCELLED');
    expect(data.request.cancellation_reason).toBe('Change of plans');
  });

  it('cancel route returns 409 conflict when transition is invalid', async () => {
    // Set request to COMPLETED so cancellation is invalid
    const existingReq = store.rideRequests.get(REQUEST_ID)!;
    store.rideRequests.set(REQUEST_ID, { ...existingReq, status: 'REJECTED' });

    const req = await makeAuthedRequest(
      `http://localhost/api/v1/ride-requests/${REQUEST_ID}/cancel`,
      PASSENGER_ID,
      { reason: 'Too late' }
    );
    const res = await cancelRoute(req, { params: Promise.resolve({ id: REQUEST_ID }) });
    expect(res.status).toBe(409);

    const error = await res.json();
    expect(error.code).toBe('INVALID_TRANSITION');
  });

  it('cancel route returns 403 for unauthorized caller', async () => {
    const req = await makeAuthedRequest(
      `http://localhost/api/v1/ride-requests/${REQUEST_ID}/cancel`,
      STRANGER_ID,
      { reason: 'Malicious cancel' }
    );
    const res = await cancelRoute(req, { params: Promise.resolve({ id: REQUEST_ID }) });
    expect(res.status).toBe(403);
  });

  it('reject route awaits store.rejectRideRequest and returns resolved object', async () => {
    const req = await makeAuthedRequest(
      `http://localhost/api/v1/ride-requests/${REQUEST_ID}/reject`,
      DRIVER_ID,
      { reason: 'Route detour too large' }
    );
    const res = await rejectRoute(req, { params: Promise.resolve({ id: REQUEST_ID }) });
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveProperty('request');
    expect(data).toHaveProperty('ride');
    expect(data.request.id).toBe(REQUEST_ID);
    expect(data.request.status).toBe('REJECTED');
    expect(data.request.rejection_reason).toBe('Route detour too large');
  });

  it('reject route returns 403 when called by non-driver', async () => {
    const req = await makeAuthedRequest(
      `http://localhost/api/v1/ride-requests/${REQUEST_ID}/reject`,
      PASSENGER_ID,
      { reason: 'I am passenger, cannot reject' }
    );
    const res = await rejectRoute(req, { params: Promise.resolve({ id: REQUEST_ID }) });
    expect(res.status).toBe(403);
  });

  it('reject route returns 409 conflict when transition is invalid', async () => {
    const existingReq = store.rideRequests.get(REQUEST_ID)!;
    store.rideRequests.set(REQUEST_ID, { ...existingReq, status: 'REJECTED' });

    const req = await makeAuthedRequest(
      `http://localhost/api/v1/ride-requests/${REQUEST_ID}/reject`,
      DRIVER_ID,
      { reason: 'Already rejected' }
    );
    const res = await rejectRoute(req, { params: Promise.resolve({ id: REQUEST_ID }) });
    expect(res.status).toBe(409);

    const error = await res.json();
    expect(error.code).toBe('INVALID_TRANSITION');
  });
});
