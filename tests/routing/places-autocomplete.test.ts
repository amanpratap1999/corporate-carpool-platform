import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getPlaces } from '@/app/api/v1/routing/places/route';
import { GET as getPlaceDetails } from '@/app/api/v1/routing/place-details/route';
import { JwtAuthProvider } from '@/infrastructure/auth/jwt-auth-provider';
import { setAuthProvider } from '@/infrastructure/auth/auth-factory';
import { setupTestRepository, ALEX_ID, ORG_ID } from '../helpers/seed-fixture';

describe('Google Places Autocomplete & Place Details Endpoints', () => {
  const secret = 'places-test-secret-at-least-32-characters!';
  let jwtProvider: JwtAuthProvider;
  let validToken: string;

  beforeEach(async () => {
    jwtProvider = new JwtAuthProvider(secret, 'places-test');
    setAuthProvider(jwtProvider);
    setupTestRepository();

    validToken = await jwtProvider.signToken({
      userId: ALEX_ID,
      organizationId: ORG_ID,
      email: 'alex.rivera@acme.com',
      capabilities: { can_ride: true, can_drive: true, is_org_admin: false },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // Autocomplete Endpoint: /api/v1/routing/places
  // =========================================================================
  describe('GET /api/v1/routing/places', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/routing/places?input=Mission');
      const res = await getPlaces(req);
      expect(res.status).toBe(401);
    });

    it('rejects missing or too short input (<2 chars) with 422', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/routing/places?input=a', {
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const res = await getPlaces(req);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('ERR_MISSING_INPUT');
    });

    it('rejects input exceeding 200 chars with 422', async () => {
      const longInput = 'a'.repeat(201);
      const req = new NextRequest(`http://localhost:3000/api/v1/routing/places?input=${longInput}`, {
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const res = await getPlaces(req);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('ERR_INPUT_TOO_LONG');
    });

    it('returns 503 when GOOGLE_MAPS_API_KEY is not configured', async () => {
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      delete process.env.GOOGLE_MAPS_API_KEY;

      try {
        const req = new NextRequest('http://localhost:3000/api/v1/routing/places?input=Mission+Dolores', {
          headers: { Authorization: `Bearer ${validToken}` },
        });
        const res = await getPlaces(req);
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.code).toBe('ERR_GOOGLE_MAPS_NOT_CONFIGURED');
      } finally {
        if (originalKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = originalKey;
      }
    });

    it('returns normalized predictions from Modern Places API', async () => {
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';

      try {
        const mockNewPlacesResponse = {
          suggestions: [
            {
              placePrediction: {
                placeId: 'ChIJ55m31tJ-j4ARX3iFz6hT7dM',
                text: { text: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA' },
                structuredFormat: {
                  mainText: { text: '1600 Amphitheatre Pkwy' },
                  secondaryText: { text: 'Mountain View, CA 94043, USA' },
                },
              },
            },
          ],
        };

        vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
          const urlStr = typeof url === 'string' ? url : url.toString();
          if (urlStr.includes('places:autocomplete')) {
            return new Response(JSON.stringify(mockNewPlacesResponse), { status: 200 });
          }
          return new Response('Not found', { status: 404 });
        });

        const req = new NextRequest('http://localhost:3000/api/v1/routing/places?input=1600+Amphitheatre', {
          headers: { Authorization: `Bearer ${validToken}` },
        });

        const res = await getPlaces(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.predictions).toHaveLength(1);
        expect(body.predictions[0]).toEqual({
          place_id: 'ChIJ55m31tJ-j4ARX3iFz6hT7dM',
          description: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA',
          main_text: '1600 Amphitheatre Pkwy',
          secondary_text: 'Mountain View, CA 94043, USA',
        });
      } finally {
        if (originalKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = originalKey;
        else delete process.env.GOOGLE_MAPS_API_KEY;
      }
    });

    it('falls back to Legacy Places API when Modern API fails', async () => {
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';

      try {
        const mockLegacyPlacesResponse = {
          status: 'OK',
          predictions: [
            {
              place_id: 'legacy-place-123',
              description: '450 Dolores St, San Francisco, CA, USA',
              structured_formatting: {
                main_text: '450 Dolores St',
                secondary_text: 'San Francisco, CA, USA',
              },
            },
          ],
        };

        vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
          const urlStr = typeof url === 'string' ? url : url.toString();
          if (urlStr.includes('places:autocomplete')) {
            return new Response('Modern API not enabled', { status: 403 });
          }
          if (urlStr.includes('maps/api/place/autocomplete/json')) {
            return new Response(JSON.stringify(mockLegacyPlacesResponse), { status: 200 });
          }
          return new Response('Not found', { status: 404 });
        });

        const req = new NextRequest('http://localhost:3000/api/v1/routing/places?input=450+Dolores', {
          headers: { Authorization: `Bearer ${validToken}` },
        });

        const res = await getPlaces(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.predictions).toHaveLength(1);
        expect(body.predictions[0]).toEqual({
          place_id: 'legacy-place-123',
          description: '450 Dolores St, San Francisco, CA, USA',
          main_text: '450 Dolores St',
          secondary_text: 'San Francisco, CA, USA',
        });
      } finally {
        if (originalKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = originalKey;
        else delete process.env.GOOGLE_MAPS_API_KEY;
      }
    });
  });

  // =========================================================================
  // Place Details Endpoint: /api/v1/routing/place-details
  // =========================================================================
  describe('GET /api/v1/routing/place-details', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/routing/place-details?place_id=preset-acme-hq');
      const res = await getPlaceDetails(req);
      expect(res.status).toBe(401);
    });

    it('rejects missing place_id with 422', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/routing/place-details', {
        headers: { Authorization: `Bearer ${validToken}` },
      });
      const res = await getPlaceDetails(req);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('ERR_MISSING_PLACE_ID');
    });

    it('resolves known presets deterministically without external API call or API key', async () => {
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      delete process.env.GOOGLE_MAPS_API_KEY;

      try {
        const req = new NextRequest(
          'http://localhost:3000/api/v1/routing/place-details?place_id=preset-acme-hq',
          {
            headers: { Authorization: `Bearer ${validToken}` },
          }
        );
        const res = await getPlaceDetails(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.place).toBeDefined();
        expect(body.place.place_id).toBe('preset-acme-hq');
        expect(body.place.lat).toBe(37.422);
        expect(body.place.lng).toBe(-122.0841);
        expect(body.place.name).toBe('Acme HQ');
      } finally {
        if (originalKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = originalKey;
      }
    });

    it('returns 503 for non-preset place_id when GOOGLE_MAPS_API_KEY is not configured', async () => {
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      delete process.env.GOOGLE_MAPS_API_KEY;

      try {
        const req = new NextRequest(
          'http://localhost:3000/api/v1/routing/place-details?place_id=ChIJ55m31tJ-j4ARX3iFz6hT7dM',
          {
            headers: { Authorization: `Bearer ${validToken}` },
          }
        );
        const res = await getPlaceDetails(req);
        expect(res.status).toBe(503);
        const body = await res.json();
        expect(body.code).toBe('ERR_GOOGLE_MAPS_NOT_CONFIGURED');
      } finally {
        if (originalKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = originalKey;
      }
    });

    it('resolves coordinates and address via Modern Place Details API', async () => {
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';

      try {
        const mockNewDetailsResponse = {
          id: 'ChIJ55m31tJ-j4ARX3iFz6hT7dM',
          formattedAddress: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA',
          displayName: { text: 'Google Building 40' },
          location: {
            latitude: 37.4220656,
            longitude: -122.0840897,
          },
          types: ['establishment', 'point_of_interest'],
        };

        vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
          const urlStr = typeof url === 'string' ? url : url.toString();
          if (urlStr.includes('places.googleapis.com/v1/places/')) {
            return new Response(JSON.stringify(mockNewDetailsResponse), { status: 200 });
          }
          return new Response('Not found', { status: 404 });
        });

        const req = new NextRequest(
          'http://localhost:3000/api/v1/routing/place-details?place_id=ChIJ55m31tJ-j4ARX3iFz6hT7dM',
          {
            headers: { Authorization: `Bearer ${validToken}` },
          }
        );

        const res = await getPlaceDetails(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.place).toEqual({
          place_id: 'ChIJ55m31tJ-j4ARX3iFz6hT7dM',
          address: '1600 Amphitheatre Pkwy, Mountain View, CA 94043, USA',
          lat: 37.4220656,
          lng: -122.0840897,
          name: 'Google Building 40',
          types: ['establishment', 'point_of_interest'],
        });
      } finally {
        if (originalKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = originalKey;
        else delete process.env.GOOGLE_MAPS_API_KEY;
      }
    });

    it('falls back to Legacy Place Details when Modern API is unavailable', async () => {
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';

      try {
        const mockLegacyDetailsResponse = {
          status: 'OK',
          result: {
            place_id: 'legacy-place-999',
            name: 'San Francisco Ferry Building',
            formatted_address: '1 Ferry Building, San Francisco, CA 94105, USA',
            geometry: {
              location: {
                lat: 37.7955,
                lng: -122.3937,
              },
            },
            types: ['transit_station', 'point_of_interest'],
          },
        };

        vi.spyOn(global, 'fetch').mockImplementation(async (url: any) => {
          const urlStr = typeof url === 'string' ? url : url.toString();
          if (urlStr.includes('places.googleapis.com/v1/places/')) {
            return new Response('Not configured', { status: 404 });
          }
          if (urlStr.includes('maps/api/place/details/json')) {
            return new Response(JSON.stringify(mockLegacyDetailsResponse), { status: 200 });
          }
          return new Response('Not found', { status: 404 });
        });

        const req = new NextRequest(
          'http://localhost:3000/api/v1/routing/place-details?place_id=legacy-place-999',
          {
            headers: { Authorization: `Bearer ${validToken}` },
          }
        );

        const res = await getPlaceDetails(req);
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.place).toEqual({
          place_id: 'legacy-place-999',
          address: '1 Ferry Building, San Francisco, CA 94105, USA',
          lat: 37.7955,
          lng: -122.3937,
          name: 'San Francisco Ferry Building',
          types: ['transit_station', 'point_of_interest'],
        });
      } finally {
        if (originalKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = originalKey;
        else delete process.env.GOOGLE_MAPS_API_KEY;
      }
    });

    it('returns 502 Bad Gateway when upstream Google Place Details fails', async () => {
      const originalKey = process.env.GOOGLE_MAPS_API_KEY;
      process.env.GOOGLE_MAPS_API_KEY = 'test-maps-key';

      try {
        vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Connection timed out'));

        const req = new NextRequest(
          'http://localhost:3000/api/v1/routing/place-details?place_id=failing-place-id',
          {
            headers: { Authorization: `Bearer ${validToken}` },
          }
        );

        const res = await getPlaceDetails(req);
        expect(res.status).toBe(502);
        const body = await res.json();
        expect(body.code).toBe('ERR_GOOGLE_MAPS_UPSTREAM_ERROR');
      } finally {
        if (originalKey !== undefined) process.env.GOOGLE_MAPS_API_KEY = originalKey;
        else delete process.env.GOOGLE_MAPS_API_KEY;
      }
    });
  });
});
