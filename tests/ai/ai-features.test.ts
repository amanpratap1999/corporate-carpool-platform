import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as parseRoute } from '../../src/app/api/v1/ai/parse-request/route';
import { POST as explainRoute } from '../../src/app/api/v1/ai/explain-match/route';
import { POST as rerankRoute } from '../../src/app/api/v1/ai/rerank/route';
import { GET as insightsRoute } from '../../src/app/api/v1/admin/ai/insights/route';
import { DataStore } from '../../src/services/data-store';
import { setRepository } from '../../src/services/repository-factory';
import { JwtAuthProvider } from '../../src/infrastructure/auth/jwt-auth-provider';
import { setAuthProvider } from '../../src/infrastructure/auth/auth-factory';
import type { Organization, User, UserCapability, Ride } from '../../src/domain/types';

const TEST_SECRET = 'test-secret-at-least-32-characters-long!';
const ORG_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';

describe('AI Features Suite (Non-RAG)', () => {
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

    const regularUser: User = {
      id: USER_ID,
      organization_id: ORG_ID,
      email: 'user@acme.corp',
      full_name: 'Regular User',
      work_department: 'Engineering',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const adminUser: User = {
      id: ADMIN_ID,
      organization_id: ORG_ID,
      email: 'admin@acme.corp',
      full_name: 'Admin User',
      work_department: 'Operations',
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.users.set(regularUser.id, regularUser);
    store.users.set(adminUser.id, adminUser);

    store.userCapabilities.set(regularUser.id, {
      id: 'cap-user',
      user_id: regularUser.id,
      organization_id: ORG_ID,
      can_ride: true,
      can_drive: false,
      is_org_admin: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    store.userCapabilities.set(adminUser.id, {
      id: 'cap-admin',
      user_id: adminUser.id,
      organization_id: ORG_ID,
      can_ride: true,
      can_drive: true,
      is_org_admin: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Add a ride for insights
    const sampleRide: Ride = {
      id: crypto.randomUUID(),
      organization_id: ORG_ID,
      driver_id: adminUser.id,
      origin: { address: 'Origin A', latitude: 26.9, longitude: 75.8 },
      destination: { address: 'Dest B', latitude: 26.95, longitude: 75.85 },
      route_waypoints: [],
      route_polyline: 'abc',
      departure_time: new Date(Date.now() + 3600000).toISOString(),
      estimated_arrival_time: new Date(Date.now() + 7200000).toISOString(),
      total_seats_offered: 4,
      available_seats: 2,
      status: 'SCHEDULED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    store.rides.set(sampleRide.id, sampleRide);
  });

  async function makeAuthedRequest(
    url: string,
    userId: string,
    method: string = 'POST',
    body?: any
  ): Promise<NextRequest> {
    const token = await authProvider.generateToken({
      userId,
      orgId: ORG_ID,
      role: 'user',
    });
    return new NextRequest(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  it('parses natural language request into structured fields', async () => {
    const req = await makeAuthedRequest(
      'http://localhost/api/v1/ai/parse-request',
      USER_ID,
      'POST',
      { text: 'Need a ride from Vaishali Nagar to Malviya Nagar tomorrow around 9 AM for 2 seats, prefer quiet ride' }
    );
    const res = await parseRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.parsed).toBeDefined();
    expect(data.parsed.origin).toContain('Vaishali Nagar');
    expect(data.parsed.destination).toContain('Malviya Nagar');
    expect(data.parsed.target_time).toBe('09:00');
    expect(data.parsed.seats_needed).toBe(2);
    expect(data.parsed.preferences.quiet_ride).toBe(true);
    expect(data.parsed.date).toBeDefined();
  });

  it('explains a match score with human-readable reasons', async () => {
    const req = await makeAuthedRequest(
      'http://localhost/api/v1/ai/explain-match',
      USER_ID,
      'POST',
      {
        match_score: 120,
        detour_meters: 350,
        delta_departure_minutes: 5,
        available_seats: 2,
        driver_name: 'Dave Driver',
      }
    );
    const res = await explainRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.explanation).toContain('Dave Driver');
    expect(data.highlights.length).toBeGreaterThan(0);
    expect(data.score_breakdown.detour_impact).toBe('minimal');
    expect(data.score_breakdown.timing_impact).toBe('exact');
  });

  it('re-ranks candidate rides using passenger preferences and department', async () => {
    const candidates = [
      {
        ride_id: 'ride-1',
        driver: { id: 'd-1', full_name: 'Driver 1', work_department: 'Marketing' },
        match_score: 150,
        nearestPickupDistanceMeters: 200,
        nearestDropDistanceMeters: 200,
        available_seats: 1,
      },
      {
        ride_id: 'ride-2',
        driver: { id: 'd-2', full_name: 'Driver 2', work_department: 'Engineering' },
        match_score: 160,
        nearestPickupDistanceMeters: 250,
        nearestDropDistanceMeters: 250,
        available_seats: 3,
      },
    ];

    const req = await makeAuthedRequest(
      'http://localhost/api/v1/ai/rerank',
      USER_ID,
      'POST',
      {
        candidates,
        preferences: {
          department_match: true,
          quiet_ride: true,
        },
      }
    );
    const res = await rerankRoute(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.reranked.length).toBe(2);
    // Ride 2 should be boosted ahead because Driver 2 is Engineering (same department as USER_ID)
    expect(data.reranked[0].ride_id).toBe('ride-2');
    expect(data.reranked[0].preference_score).toBeGreaterThan(data.reranked[1].preference_score);
  });

  it('rejects natural language text exceeding 500 characters', async () => {
    const longText = 'A'.repeat(501);
    const req = await makeAuthedRequest(
      'http://localhost/api/v1/ai/parse-request',
      USER_ID,
      'POST',
      { text: longText }
    );
    const res = await parseRoute(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.code).toBe('ERR_TEXT_TOO_LONG');
  });

  it('rejects candidate rides with zero available seats in rerank', async () => {
    const zeroSeatCandidates = [
      {
        ride_id: 'ride-zero',
        driver: { id: 'd-zero', full_name: 'Driver 0' },
        match_score: 100,
        nearestPickupDistanceMeters: 100,
        nearestDropDistanceMeters: 100,
        available_seats: 0,
      },
    ];

    const req = await makeAuthedRequest(
      'http://localhost/api/v1/ai/rerank',
      USER_ID,
      'POST',
      { candidates: zeroSeatCandidates }
    );
    const res = await rerankRoute(req);
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.code).toBe('ERR_NO_VALID_CANDIDATES');
  });

  it('respects ENABLE_VECTOR_RERANKING=false feature flag', async () => {
    const prevFlag = process.env.ENABLE_VECTOR_RERANKING;
    process.env.ENABLE_VECTOR_RERANKING = 'false';

    try {
      const candidates = [
        {
          ride_id: 'ride-1',
          driver: { id: 'd-1', full_name: 'Driver 1' },
          match_score: 150,
          nearestPickupDistanceMeters: 200,
          nearestDropDistanceMeters: 200,
          available_seats: 2,
        },
      ];

      const req = await makeAuthedRequest(
        'http://localhost/api/v1/ai/rerank',
        USER_ID,
        'POST',
        { candidates }
      );
      const res = await rerankRoute(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.reranked[0].preference_score).toBe(50);
      expect(data.reranked[0].final_score).toBe(150);
    } finally {
      if (prevFlag === undefined) delete process.env.ENABLE_VECTOR_RERANKING;
      else process.env.ENABLE_VECTOR_RERANKING = prevFlag;
    }
  });

  it('admin insights succeeds for admin and rejects non-admin', async () => {
    // Non-admin request
    const userReq = await makeAuthedRequest(
      'http://localhost/api/v1/admin/ai/insights',
      USER_ID,
      'GET'
    );
    const userRes = await insightsRoute(userReq);
    expect(userRes.status).toBe(403);

    // Admin request
    const adminReq = await makeAuthedRequest(
      'http://localhost/api/v1/admin/ai/insights',
      ADMIN_ID,
      'GET'
    );
    const adminRes = await insightsRoute(adminReq);
    expect(adminRes.status).toBe(200);

    const report = await adminRes.json();
    expect(report.organization.id).toBe(ORG_ID);
    expect(report.metrics.total_rides).toBe(1);
    expect(report.metrics.total_seats_offered).toBe(4);
    expect(report.metrics.seats_booked).toBe(2);
    expect(report.metrics.seat_utilization_rate_percent).toBe(50);
    expect(report.key_findings.length).toBeGreaterThan(0);
  });
});
