import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as invitePOST } from '@/app/api/v1/admin/users/invite/route';
import { POST as activatePOST } from '@/app/api/v1/auth/activate/route';
import { POST as loginPOST } from '@/app/api/v1/auth/login/route';
import { POST as vehiclePOST } from '@/app/api/v1/vehicles/route';
import { POST as ridePOST } from '@/app/api/v1/rides/route';
import { GET as searchGET } from '@/app/api/v1/rides/search/route';
import { POST as requestPOST } from '@/app/api/v1/rides/[id]/requests/route';
import { POST as acceptPOST } from '@/app/api/v1/ride-requests/[id]/accept/route';
import { POST as startPOST } from '@/app/api/v1/rides/[id]/start/route';
import { POST as completePOST } from '@/app/api/v1/rides/[id]/complete/route';
import { JwtAuthProvider } from '@/infrastructure/auth/jwt-auth-provider';
import { setAuthProvider } from '@/infrastructure/auth/auth-factory';
import { setupTestRepository, MARCUS_ID, SARAH_ID, ORG_ID } from '../helpers/seed-fixture';

describe('End-to-End User & Ride Lifecycle Flow', () => {
  const secret = 'e2e-test-secret-at-least-32-chars-long!!';
  let jwtProvider: JwtAuthProvider;

  beforeEach(() => {
    jwtProvider = new JwtAuthProvider(secret, 'carpool-enterprise');
    setAuthProvider(jwtProvider);
    setupTestRepository();
  });

  it('executes full flow: Admin invite → activation → login → create vehicle → create ride → search ride → request ride → accept request → start → complete', async () => {
    // 1. Admin Marcus invites new driver "Dave Driver"
    const adminToken = await jwtProvider.signToken({
      userId: MARCUS_ID,
      organizationId: ORG_ID,
      email: 'marcus.vance@acme.com',
      capabilities: { can_ride: true, can_drive: false, is_org_admin: true },
    });

    const inviteReq = new NextRequest('http://localhost:3000/api/v1/admin/users/invite', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        email: 'dave.driver@acme.corp',
        full_name: 'Dave Driver',
        work_department: 'Engineering',
        can_drive: true,
      }),
    });

    const inviteRes = await invitePOST(inviteReq);
    expect(inviteRes.status).toBe(201);
    const inviteData = await inviteRes.json();
    expect(inviteData.invitation?.token).toBeDefined();
    const rawToken = inviteData.invitation.token;

    // 2. Dave activates account with raw token and sets password
    const activateReq = new NextRequest('http://localhost:3000/api/v1/auth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: rawToken,
        password: 'secure-password-2026',
      }),
    });

    const activateRes = await activatePOST(activateReq);
    expect(activateRes.status).toBe(200);
    const activateData = await activateRes.json();
    expect(activateData.user.status).toBe('ACTIVE');

    // 3. Dave logs in with email & password
    const loginReq = new NextRequest('http://localhost:3000/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dave.driver@acme.corp',
        password: 'secure-password-2026',
      }),
    });

    const loginRes = await loginPOST(loginReq);
    expect(loginRes.status).toBe(200);
    const loginData = await loginRes.json();
    expect(loginData.token).toBeDefined();
    const daveToken = loginData.token;

    // 4. Dave registers a vehicle
    const vehicleReq = new NextRequest('http://localhost:3000/api/v1/vehicles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${daveToken}`,
      },
      body: JSON.stringify({
        make: 'Tesla',
        model: 'Model 3',
        year: 2023,
        color: 'Blue',
        license_plate: 'E2E-789',
        total_seats: 4,
        vehicle_type: 'CAR',
      }),
    });

    const vehicleRes = await vehiclePOST(vehicleReq);
    expect(vehicleRes.status).toBe(201);
    const vehicleData = await vehicleRes.json();
    expect(vehicleData.id).toBeDefined();
    const vehicleId = vehicleData.id;

    // 5. Dave publishes a ride from SF to Mountain View
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const depTime = `${tomorrow.toISOString().split('T')[0]}T08:00:00Z`;
    const arrTime = `${tomorrow.toISOString().split('T')[0]}T09:15:00Z`;

    const rideReq = new NextRequest('http://localhost:3000/api/v1/rides', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${daveToken}`,
      },
      body: JSON.stringify({
        vehicle_id: vehicleId,
        departure_time: depTime,
        arrival_time_estimated: arrTime,
        total_seats_offered: 3,
        cost_per_seat_cents: 0,
        route: {
          origin_address: '123 Market St, San Francisco, CA',
          origin_latitude: 37.7749,
          origin_longitude: -122.4194,
          destination_address: '1600 Amphitheatre Pkwy, Mountain View, CA',
          destination_latitude: 37.422,
          destination_longitude: -122.0841,
          total_distance_meters: 55000,
          total_duration_seconds: 3600,
          waypoints: [
            {
              stop_order: 0,
              point_type: 'ORIGIN',
              address_text: '123 Market St, San Francisco, CA',
              latitude: 37.7749,
              longitude: -122.4194,
              estimated_arrival_offset_seconds: 0,
            },
            {
              stop_order: 1,
              point_type: 'CORRIDOR',
              address_text: 'Millbrae BART, CA',
              latitude: 37.5997,
              longitude: -122.3867,
              estimated_arrival_offset_seconds: 1200,
            },
            {
              stop_order: 2,
              point_type: 'DESTINATION',
              address_text: '1600 Amphitheatre Pkwy, Mountain View, CA',
              latitude: 37.422,
              longitude: -122.0841,
              estimated_arrival_offset_seconds: 3600,
            },
          ],
        },
      }),
    });

    const rideRes = await ridePOST(rideReq);
    expect(rideRes.status).toBe(201);
    const rideData = await rideRes.json();
    expect(rideData.ride.id).toBeDefined();
    const rideId = rideData.ride.id;

    // 6. Commuter Sarah searches for a ride matching this corridor
    const sarahToken = await jwtProvider.signToken({
      userId: SARAH_ID,
      organizationId: ORG_ID,
      email: 'sarah.chen@acme.corp',
      capabilities: { can_ride: true, can_drive: false, is_org_admin: false },
    });

    const dateStr = tomorrow.toISOString().split('T')[0];
    const searchUrl = `http://localhost:3000/api/v1/rides/search?origin_lat=37.7749&origin_lng=-122.4194&dest_lat=37.422&dest_lng=-122.0841&date=${dateStr}&window_start=07:30&window_end=09:00&seats_needed=1`;
    const searchReq = new NextRequest(searchUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${sarahToken}`,
      },
    });

    const searchRes = await searchGET(searchReq);
    expect(searchRes.status).toBe(200);
    const searchData = await searchRes.json();
    expect(searchData.rides).toBeDefined();
    expect(searchData.rides.length).toBeGreaterThanOrEqual(1);
    const foundRide = searchData.rides.find((m: any) => m.ride.id === rideId);
    expect(foundRide).toBeDefined();

    // 7. Sarah requests 1 seat on Dave's ride
    const reqReq = new NextRequest(`http://localhost:3000/api/v1/rides/${rideId}/requests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sarahToken}`,
      },
      body: JSON.stringify({
        pickup_point: {
          address_text: 'Market St SF',
          latitude: 37.7749,
          longitude: -122.4194,
        },
        drop_point: {
          address_text: 'Mountain View HQ',
          latitude: 37.422,
          longitude: -122.0841,
        },
        requested_seats: 1,
      }),
    });

    const reqRes = await requestPOST(reqReq, { params: Promise.resolve({ id: rideId }) });
    expect(reqRes.status).toBe(202);
    const reqData = await reqRes.json();
    expect(reqData.status).toBe('PENDING');
    const requestId = reqData.id;

    // 8. Dave accepts Sarah's request
    const acceptReq = new NextRequest(`http://localhost:3000/api/v1/ride-requests/${requestId}/accept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${daveToken}`,
      },
    });

    const acceptRes = await acceptPOST(acceptReq, { params: Promise.resolve({ id: requestId }) });
    expect(acceptRes.status).toBe(200);
    const acceptData = await acceptRes.json();
    expect(acceptData.request.status).toBe('ACCEPTED');
    expect(acceptData.ride.available_seats).toBe(2); // 3 - 1 = 2

    // 9. Dave starts the ride
    const startReq = new NextRequest(`http://localhost:3000/api/v1/rides/${rideId}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${daveToken}`,
      },
    });

    const startRes = await startPOST(startReq, { params: Promise.resolve({ id: rideId }) });
    expect(startRes.status).toBe(200);
    const startData = await startRes.json();
    expect(startData.ride.status).toBe('IN_PROGRESS');

    // 10. Dave completes the ride
    const completeReq = new NextRequest(`http://localhost:3000/api/v1/rides/${rideId}/complete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${daveToken}`,
      },
    });

    const completeRes = await completePOST(completeReq, { params: Promise.resolve({ id: rideId }) });
    expect(completeRes.status).toBe(200);
    const completeData = await completeRes.json();
    expect(completeData.ride.status).toBe('COMPLETED');
  });
});
