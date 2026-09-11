import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v1/routing/directions/route';
import { JwtAuthProvider } from '@/infrastructure/auth/jwt-auth-provider';
import { setAuthProvider } from '@/infrastructure/auth/auth-factory';
import { setupTestRepository, ALEX_ID, ORG_ID } from '../helpers/seed-fixture';

describe('Google Directions API Proxy & Route Alternatives', () => {
  const secret = 'directions-test-secret-at-least-32-characters!';
  let jwtProvider: JwtAuthProvider;

  beforeEach(() => {
    jwtProvider = new JwtAuthProvider(secret, 'directions-test');
    setAuthProvider(jwtProvider);
    setupTestRepository(); // seed in-memory store
  });

  it('rejects unauthenticated directions request with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/routing/directions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origin: { lat: 37.7615, lng: -122.426 },
        destination: { lat: 37.422, lng: -122.0841 },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('rejects missing origin/destination coordinates with 422', async () => {
    const token = await jwtProvider.signToken({
      userId: ALEX_ID,
      organizationId: ORG_ID,
      email: 'alex.rivera@acme.com',
      capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/routing/directions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        origin: { lat: 37.7615 }, // missing lng and destination
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.title).toBe('Unprocessable Entity');
  });

  it('returns 503 Service Unavailable when GOOGLE_MAPS_API_KEY is not configured', async () => {
    // Verify the endpoint correctly refuses to serve fake data when no API key is present.
    // This test exercises the production safety gate that prevents simulated route fallbacks.
    const token = await jwtProvider.signToken({
      userId: ALEX_ID,
      organizationId: ORG_ID,
      email: 'alex.rivera@acme.com',
      capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
    });

    // Temporarily ensure no API key is set (clear any that might be in env)
    const originalKey = process.env.GOOGLE_MAPS_API_KEY;
    const originalKey2 = process.env.GOOGLE_DIRECTIONS_API_KEY;
    delete process.env.GOOGLE_MAPS_API_KEY;
    delete process.env.GOOGLE_DIRECTIONS_API_KEY;

    try {
      const req = new NextRequest('http://localhost:3000/api/v1/routing/directions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          origin: { lat: 37.7615, lng: -122.426, address: '450 Dolores St, San Francisco, CA' },
          destination: { lat: 37.422, lng: -122.0841, address: '1600 Amphitheatre Pkwy, Mountain View, CA' },
          alternatives: true,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.code).toBe('ERR_GOOGLE_MAPS_NOT_CONFIGURED');
    } finally {
      // Restore env
      if (originalKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = originalKey;
      if (originalKey2 !== undefined) process.env.GOOGLE_DIRECTIONS_API_KEY = originalKey2;
    }
  });

  // Live Google API test — only runs when credentials are available
  it.skipIf(!process.env.GOOGLE_MAPS_API_KEY)(
    'returns real route alternatives from Google when API key is configured',
    async () => {
      const token = await jwtProvider.signToken({
        userId: ALEX_ID,
        organizationId: ORG_ID,
        email: 'alex.rivera@acme.com',
        capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/routing/directions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          origin: { lat: 37.7615, lng: -122.426, address: '450 Dolores St, San Francisco, CA' },
          destination: { lat: 37.422, lng: -122.0841, address: '1600 Amphitheatre Pkwy, Mountain View, CA' },
          alternatives: true,
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.routes).toBeDefined();
      expect(body.routes.length).toBeGreaterThanOrEqual(1);
      const route = body.routes[0];
      expect(route.route_id).toBeDefined();
      expect(route.total_distance_meters).toBeGreaterThan(0);
      expect(route.total_duration_seconds).toBeGreaterThan(0);
      expect(route.waypoints[0].point_type).toBe('ORIGIN');
      expect(route.waypoints[route.waypoints.length - 1].point_type).toBe('DESTINATION');
    }
  );

  it.skipIf(!process.env.GOOGLE_MAPS_API_KEY)(
    'returns real place predictions from Google Places Autocomplete when API key is configured',
    async () => {
      const { GET: placesGET } = await import('@/app/api/v1/routing/places/route');
      const token = await jwtProvider.signToken({
        userId: ALEX_ID,
        organizationId: ORG_ID,
        email: 'alex.rivera@acme.com',
        capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/routing/places?input=San%20Francisco', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const res = await placesGET(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.predictions).toBeDefined();
      expect(body.predictions.length).toBeGreaterThanOrEqual(1);
      expect(body.predictions[0].place_id).toBeDefined();
      expect(body.predictions[0].description).toContain('San Francisco');
    }
  );
});
