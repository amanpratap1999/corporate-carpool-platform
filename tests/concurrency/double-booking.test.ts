import { describe, it, expect, beforeEach } from 'vitest';
import { IDataRepository } from '../../src/services/repository.interface';
import { getRepository } from '../../src/services/repository-factory';
import { Ride, RideRequest } from '../../src/domain/types';
import { setupTestRepository, ORG_ID, ALEX_ID } from '../helpers/seed-fixture';

describe('Gate 2: Concurrency & Double-Booking Prevention', () => {
  let store: IDataRepository;

  beforeEach(async () => {
    if (process.env.DATABASE_URL) {
      await setupTestRepository();
      store = getRepository();
    }
  });

  it.skipIf(!process.env.DATABASE_URL)('prevents double-booking when 10 concurrent requests attempt to claim the last 1 remaining seat', async () => {
    const rideId = crypto.randomUUID();

    // Ride with EXACTLY 1 available seat
    const ride: Ride = {
      id: rideId,
      organization_id: ORG_ID,
      driver_id: ALEX_ID,
      vehicle_id: 'veh-1',
      status: 'SCHEDULED',
      departure_time: new Date(Date.now() + 3600000).toISOString(),
      arrival_time_estimated: new Date(Date.now() + 7200000).toISOString(),
      total_seats_offered: 1,
      available_seats: 1,
      cost_per_seat_cents: 500,
      currency: 'USD',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.setRide(ride);

    // Create 10 distinct passenger requests for this 1 seat
    const requestIds: string[] = [];
    for (let i = 0; i < 10; i++) {
      const reqId = crypto.randomUUID();
      requestIds.push(reqId);
      const req: RideRequest = {
        id: reqId,
        organization_id: ORG_ID,
        ride_id: rideId,
        passenger_id: `passenger-uuid-${i}`,
        pickup_point_id: `pickup-${i}`,
        drop_point_id: `drop-${i}`,
        requested_seats: 1,
        status: 'PENDING',
        version: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await store.setRideRequest(req);
    }

    // Fire 10 simultaneous approvals using pessimistic lock
    const results = await Promise.allSettled(
      requestIds.map((id) => store.acceptRideRequestWithPessimisticLock(id, ALEX_ID))
    );

    const successfulApprovals = results.filter((r) => r.status === 'fulfilled');
    const rejectedApprovals = results.filter((r) => r.status === 'rejected');

    // Exactly 1 must succeed
    expect(successfulApprovals.length).toBe(1);

    // Exactly 9 must be rejected
    expect(rejectedApprovals.length).toBe(9);

    // Verify rejection reason is insufficient seats
    for (const rejected of rejectedApprovals) {
      if (rejected.status === 'rejected') {
        expect(rejected.reason.message).toContain('Insufficient seats');
      }
    }

    // Check invariant: Available seats MUST be exactly 0, never negative!
    const finalRide = await store.getRide(rideId);
    expect(finalRide!.available_seats).toBe(0);
    expect(finalRide!.available_seats >= 0).toBe(true);

    // Only 1 passenger in manifest
    const passengers = await store.getAllRidePassengers();
    const manifest = passengers.filter(p => p.ride_id === rideId);
    expect(manifest.length).toBe(1);
  });
});
