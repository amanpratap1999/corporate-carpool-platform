import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as registerVehicle } from '../../src/app/api/v1/vehicles/route';
import { POST as publishRide } from '../../src/app/api/v1/rides/route';
import { JwtAuthProvider } from '../../src/infrastructure/auth/jwt-auth-provider';
import { setAuthProvider } from '../../src/infrastructure/auth/auth-factory';
import { setupTestRepository, ALEX_ID, ORG_ID } from '../helpers/seed-fixture';

describe('Gate 2: Multimodal Vehicle Expansion Tests', () => {
  const secret = 'multimodal-test-secret-at-least-32-characters!';
  let jwtProvider: JwtAuthProvider;

  beforeEach(() => {
    jwtProvider = new JwtAuthProvider(secret, 'multimodal-test');
    setAuthProvider(jwtProvider);
    setupTestRepository(); // seed in-memory store
  });

  it('allows registering a motorcycle with 1 passenger seat and publishing a 1-seat carpool', async () => {
    const token = await jwtProvider.signToken({
      userId: ALEX_ID,
      organizationId: ORG_ID,
      email: 'alex.rivera@acme.com',
      capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
    });

    // 1. Register a motorcycle
    const vehicleReq = new NextRequest('http://localhost:3000/api/v1/vehicles', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        make: 'Honda',
        model: 'CB500X',
        year: 2023,
        color: 'Matte Black',
        license_plate: 'MOTO-999',
        total_seats: 2,
        vehicle_type: 'MOTORCYCLE',
      }),
    });

    const vehicleRes = await registerVehicle(vehicleReq);
    expect(vehicleRes.status).toBe(201);
    const vehicleData = await vehicleRes.json();
    expect(vehicleData.vehicle_type).toBe('MOTORCYCLE');
    expect(vehicleData.max_passenger_capacity).toBe(1);

    // 2. Publish a 1-seat carpool for this motorcycle
    const tomorrow = new Date(Date.now() + 86400000);
    const departureIso = tomorrow.toISOString();
    const arrivalIso = new Date(tomorrow.getTime() + 3600000).toISOString();

    const rideReq = new NextRequest('http://localhost:3000/api/v1/rides', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vehicle_id: vehicleData.id,
        departure_time: departureIso,
        arrival_time_estimated: arrivalIso,
        total_seats_offered: 1,
        cost_per_seat_cents: 300,
        route: {
          origin_address: 'Mission District, SF',
          origin_latitude: 37.7615,
          origin_longitude: -122.426,
          destination_address: 'Acme HQ, Mountain View',
          destination_latitude: 37.422,
          destination_longitude: -122.0841,
        },
      }),
    });

    const rideRes = await publishRide(rideReq);
    expect(rideRes.status).toBe(201);
    const rideData = await rideRes.json();
    expect(rideData.ride.total_seats_offered).toBe(1);
    expect(rideData.ride.available_seats).toBe(1);

    // 3. Attempting to offer 2 passenger seats on a motorcycle must be rejected
    const overCapacityReq = new NextRequest('http://localhost:3000/api/v1/rides', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vehicle_id: vehicleData.id,
        departure_time: departureIso,
        arrival_time_estimated: arrivalIso,
        total_seats_offered: 2, // Exceeds max_passenger_capacity: 1
        cost_per_seat_cents: 300,
        route: {
          origin_address: 'Mission District, SF',
          origin_latitude: 37.7615,
          origin_longitude: -122.426,
          destination_address: 'Acme HQ, Mountain View',
          destination_latitude: 37.422,
          destination_longitude: -122.0841,
        },
      }),
    });

    const overCapacityRes = await publishRide(overCapacityReq);
    expect(overCapacityRes.status).toBe(400);
    const errBody = await overCapacityRes.json();
    expect(errBody.code).toBe('CAPACITY_EXCEEDED');
  });
});
