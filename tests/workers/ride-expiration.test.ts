import { describe, it, expect, beforeEach } from 'vitest';
import { IDataRepository } from '../../src/services/repository.interface';
import { getRepository } from '../../src/services/repository-factory';
import { RideExpirationWorker } from '../../src/workers/ride-expiration.worker';
import { Ride, RideRequest } from '../../src/domain/types';
import { setupTestRepository, ORG_ID, ALEX_ID } from '../helpers/seed-fixture';

describe('Gate 2: Background Ride Expiration Worker Tests', () => {
  let store: IDataRepository;
  let worker: RideExpirationWorker;

  beforeEach(async () => {
    // Inject freshly seeded repository (Postgres or DataStore depending on ENV)
    await setupTestRepository();
    store = getRepository();
    worker = new RideExpirationWorker();
  });

  it('expires stale PENDING requests on departed rides', async () => {
    // A ride that departed 10 minutes ago
    const pastDeparture = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const ride: Ride = {
      id: crypto.randomUUID(),
      organization_id: ORG_ID,
      driver_id: ALEX_ID,
      vehicle_id: 'veh-1',
      status: 'SCHEDULED',
      departure_time: pastDeparture,
      arrival_time_estimated: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      total_seats_offered: 3,
      available_seats: 3,
      cost_per_seat_cents: 0,
      currency: 'USD',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.setRide(ride);

    const staleRequest: RideRequest = {
      id: crypto.randomUUID(),
      organization_id: ORG_ID,
      ride_id: ride.id,
      passenger_id: '33333333-3333-4333-8333-333333333333', // SARAH_ID
      pickup_point_id: 'pickup-1',
      drop_point_id: 'drop-1',
      requested_seats: 1,
      status: 'PENDING',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.setRideRequest(staleRequest);

    const report = await worker.runCycle();

    expect(report.expiredRequestsCount).toBe(1);
    const updatedReq = await store.getRideRequest(staleRequest.id);
    expect(updatedReq!.status).toBe('EXPIRED');

    // Notification dispatched
    const notifs = await store.getAllNotifications();
    expect(notifs.some((n) => n.user_id === staleRequest.passenger_id && n.title === 'Seat Request Expired')).toBe(true);
  });

  it('automatically cancels SCHEDULED rides that were never started past departure + 30m', async () => {
    // A ride that was scheduled for 45 minutes ago and never started
    const oldDeparture = new Date(Date.now() - 45 * 60 * 1000).toISOString();
    const ride: Ride = {
      id: crypto.randomUUID(),
      organization_id: ORG_ID,
      driver_id: ALEX_ID,
      vehicle_id: 'veh-1',
      status: 'SCHEDULED',
      departure_time: oldDeparture,
      arrival_time_estimated: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
      total_seats_offered: 3,
      available_seats: 2,
      cost_per_seat_cents: 0,
      currency: 'USD',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.setRide(ride);

    // Accepted passenger on this ride
    const acceptedReq: RideRequest = {
      id: crypto.randomUUID(),
      organization_id: ORG_ID,
      ride_id: ride.id,
      passenger_id: '44444444-4444-4444-8444-444444444444', // DAVID_ID
      pickup_point_id: 'pickup-2',
      drop_point_id: 'drop-2',
      requested_seats: 1,
      status: 'ACCEPTED',
      version: 2,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.setRideRequest(acceptedReq);

    const report = await worker.runCycle();

    expect(report.cancelledRidesCount).toBe(1);
    const updatedRide = await store.getRide(ride.id);
    expect(updatedRide!.status).toBe('CANCELLED');
    expect(updatedRide!.cancelled_reason).toContain('Driver did not initiate trip');

    // Accepted request cascades to CANCELLED
    const updatedReq = await store.getRideRequest(acceptedReq.id);
    expect(updatedReq!.status).toBe('CANCELLED');
  });
});
