import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/v1/rides/search/route';
import { DataStore } from '@/services/data-store';
import { setRepository } from '@/services/repository-factory';
import { setAuthProvider } from '@/infrastructure/auth/auth-factory';
import { JwtAuthProvider } from '@/infrastructure/auth/jwt-auth-provider';
import { setupTestRepository, ALEX_ID, SARAH_ID, ORG_ID } from '../helpers/seed-fixture';
import { Ride, RideRoute, RouteWaypoint } from '@/domain/types';

describe('Search Time-Window Filtering, Authoritative Invariants & Deterministic Ranking', () => {
  let store: DataStore;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Tests use an explicitly configured signed JWT provider; no dev identity bypass exists.
  const jwtSecret = 'search-ranking-test-secret-at-least-32-chars!';
  let jwtProvider: JwtAuthProvider;
  let alexToken: string;

  beforeEach(async () => {
    store = setupTestRepository();
    jwtProvider = new JwtAuthProvider(jwtSecret, 'search-test');
    setAuthProvider(jwtProvider);

    alexToken = await jwtProvider.signToken({
      userId: ALEX_ID,
      organizationId: ORG_ID,
      email: 'alex.rivera@acme.corp',
      capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
    });

    // Add Ride B: departs 09:30, same corridor, 3 available seats
    const rideBId = '88888888-8888-4888-8888-888888888888';
    const vehicleId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const rideB: Ride = {
      id: rideBId, organization_id: ORG_ID, driver_id: SARAH_ID,
      vehicle_id: vehicleId, status: 'SCHEDULED',
      departure_time: `${tomorrowStr}T09:30:00Z`,
      arrival_time_estimated: `${tomorrowStr}T10:15:00Z`,
      total_seats_offered: 3, available_seats: 3,
      cost_per_seat_cents: 300, currency: 'USD',
      notes: 'Mid-morning commute',
      version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    store.rides.set(rideB.id, rideB);

    const routeBId = crypto.randomUUID();
    const routeB: RideRoute = {
      id: routeBId, ride_id: rideBId, organization_id: ORG_ID,
      origin_address: '450 Dolores St, San Francisco, CA',
      origin_latitude: 37.7615, origin_longitude: -122.426,
      destination_address: '1600 Amphitheatre Pkwy, Mountain View, CA',
      destination_latitude: 37.422, destination_longitude: -122.0841,
      total_distance_meters: 53200, total_duration_seconds: 2700,
      min_latitude: 37.422, max_latitude: 37.7615,
      min_longitude: -122.426, max_longitude: -122.0841,
      bounding_box: { min_lat: 37.422, max_lat: 37.7615, min_lng: -122.426, max_lng: -122.0841 },
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    };
    store.rideRoutes.set(routeB.id, routeB);

    const waypoints: RouteWaypoint[] = [
      { id: `wp-${rideBId}-0`, route_id: routeBId, organization_id: ORG_ID, stop_order: 0, point_type: 'ORIGIN', estimated_arrival_offset_seconds: 0, address_text: 'SF Mission', latitude: 37.7615, longitude: -122.426, created_at: new Date().toISOString() },
      { id: `wp-${rideBId}-1`, route_id: routeBId, organization_id: ORG_ID, stop_order: 1, point_type: 'CORRIDOR', estimated_arrival_offset_seconds: 600, address_text: 'Millbrae BART', latitude: 37.5997, longitude: -122.3867, created_at: new Date().toISOString() },
      { id: `wp-${rideBId}-2`, route_id: routeBId, organization_id: ORG_ID, stop_order: 2, point_type: 'DESTINATION', estimated_arrival_offset_seconds: 1200, address_text: 'Mountain View HQ', latitude: 37.422, longitude: -122.0841, created_at: new Date().toISOString() },
    ];
    waypoints.forEach((w) => store.routeWaypoints.set(w.id, w));
  });

  it('filters rides within the requested departure time window', async () => {
    const url = new URL('http://localhost:3000/api/v1/rides/search');
    url.searchParams.set('origin_lat', '37.5997');
    url.searchParams.set('origin_lng', '-122.3867');
    url.searchParams.set('dest_lat', '37.422');
    url.searchParams.set('dest_lng', '-122.0841');
    url.searchParams.set('date', tomorrowStr);
    url.searchParams.set('time_zone', 'UTC');
    url.searchParams.set('window_start', '08:00');
    url.searchParams.set('window_end', '08:30');

    const req = new NextRequest(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${alexToken}` },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.rides.length).toBe(1);
    expect(data.rides[0].ride.departure_time).toContain('08:15');
  });

  it('excludes rides outside the departure time window', async () => {
    const url = new URL('http://localhost:3000/api/v1/rides/search');
    url.searchParams.set('origin_lat', '37.5997');
    url.searchParams.set('origin_lng', '-122.3867');
    url.searchParams.set('dest_lat', '37.422');
    url.searchParams.set('dest_lng', '-122.0841');
    url.searchParams.set('date', tomorrowStr);
    url.searchParams.set('time_zone', 'UTC');
    url.searchParams.set('window_start', '11:00');
    url.searchParams.set('window_end', '12:00');

    const req = new NextRequest(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${alexToken}` },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.rides.length).toBe(0);
  });

  it('ranks results using the deterministic composite MatchScore formula', async () => {
    const url = new URL('http://localhost:3000/api/v1/rides/search');
    url.searchParams.set('origin_lat', '37.5997');
    url.searchParams.set('origin_lng', '-122.3867');
    url.searchParams.set('dest_lat', '37.422');
    url.searchParams.set('dest_lng', '-122.0841');
    url.searchParams.set('date', tomorrowStr);
    url.searchParams.set('time_zone', 'UTC');
    url.searchParams.set('window_start', '08:00');
    url.searchParams.set('window_end', '10:00');
    url.searchParams.set('target_time', `${tomorrowStr}T09:30:00Z`);

    const req = new NextRequest(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${alexToken}` },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.rides.length).toBeGreaterThanOrEqual(2);
    // 09:30 ride has delta=0, 3 seats → ranks first
    expect(data.rides[0].ride.departure_time).toContain('09:30');
    expect(data.rides[0].match_score).toBeDefined();
    expect(data.rides[0].delta_departure_minutes).toBe(0);
    expect(data.rides[0].match_score).toBeLessThan(data.rides[1].match_score);
  });

  it('rejects reverse-direction searches where passenger requests drop before pickup along driver corridor', async () => {
    const url = new URL('http://localhost:3000/api/v1/rides/search');
    url.searchParams.set('origin_lat', '37.422');    // Origin: Mountain View
    url.searchParams.set('origin_lng', '-122.0841');
    url.searchParams.set('dest_lat', '37.5997');     // Destination: Millbrae
    url.searchParams.set('dest_lng', '-122.3867');
    url.searchParams.set('date', tomorrowStr);

    const req = new NextRequest(url.toString(), {
      method: 'GET',
      headers: { Authorization: `Bearer ${alexToken}` },
    });

    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.rides.length).toBe(0);
  });
});
