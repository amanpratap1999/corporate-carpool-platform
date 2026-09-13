import { describe, it, expect, beforeEach } from 'vitest';
import { IDataRepository, ConcurrencyConflictError } from '../../src/services/repository.interface';
import { PostgresStore } from '../../src/services/postgres-store';
import { DataStore } from '../../src/services/data-store';
import { Ride, RideRequest } from '../../src/domain/types';
import { setupTestRepository, setupDatabaseTestRepository, ORG_ID, ALEX_ID, SARAH_ID, VEHICLE_ID, PICKUP_ID, DROP_ID } from '../helpers/seed-fixture';

describe('OCC Versioning and Concurrency Conflict Handling', () => {
  let store: IDataRepository;

  beforeEach(async () => {
    if (process.env.DATABASE_URL) {
      store = await setupDatabaseTestRepository();
      expect(store).toBeInstanceOf(PostgresStore);
    } else {
      store = setupTestRepository();
    }
  });

  it('increments version on ride and ride request when request is accepted', async () => {
    const rideId = crypto.randomUUID();
    const requestId = crypto.randomUUID();

    const ride: Ride = {
      id: rideId,
      organization_id: ORG_ID,
      driver_id: ALEX_ID,
      vehicle_id: VEHICLE_ID,
      status: 'SCHEDULED',
      departure_time: new Date(Date.now() + 3600000).toISOString(),
      arrival_time_estimated: new Date(Date.now() + 7200000).toISOString(),
      total_seats_offered: 3,
      available_seats: 3,
      cost_per_seat_cents: 500,
      currency: 'USD',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.setRide(ride);

    const req: RideRequest = {
      id: requestId,
      organization_id: ORG_ID,
      ride_id: rideId,
      passenger_id: SARAH_ID,
      pickup_point_id: PICKUP_ID,
      drop_point_id: DROP_ID,
      requested_seats: 1,
      status: 'PENDING',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.setRideRequest(req);

    const { request: updatedReq, ride: updatedRide } = await store.acceptRideRequestWithPessimisticLock(requestId, ALEX_ID);

    expect(updatedRide.version).toBe(2);
    expect(updatedReq.version).toBe(2);

    const fetchedRide = await store.getRide(rideId);
    expect(fetchedRide?.version).toBe(2);
    expect(fetchedRide?.available_seats).toBe(2);

    const fetchedReq = await store.getRideRequest(requestId);
    expect(fetchedReq?.version).toBe(2);
    expect(fetchedReq?.status).toBe('ACCEPTED');
  });

  it('increments ride version when starting and completing a ride', async () => {
    const rideId = crypto.randomUUID();

    const ride: Ride = {
      id: rideId,
      organization_id: ORG_ID,
      driver_id: ALEX_ID,
      vehicle_id: VEHICLE_ID,
      status: 'SCHEDULED',
      departure_time: new Date(Date.now() + 3600000).toISOString(),
      arrival_time_estimated: new Date(Date.now() + 7200000).toISOString(),
      total_seats_offered: 3,
      available_seats: 3,
      cost_per_seat_cents: 500,
      currency: 'USD',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.setRide(ride);

    const startedRide = await store.startRideWithPessimisticLock(rideId, ALEX_ID);
    expect(startedRide.status).toBe('IN_PROGRESS');
    expect(startedRide.version).toBe(2);

    const completedRide = await store.completeRideWithPessimisticLock(rideId, ALEX_ID);
    expect(completedRide.status).toBe('COMPLETED');
    expect(completedRide.version).toBe(3);
  });

  it('increments version on rejection and cancellation', async () => {
    const rideId = crypto.randomUUID();
    const requestId = crypto.randomUUID();

    const ride: Ride = {
      id: rideId,
      organization_id: ORG_ID,
      driver_id: ALEX_ID,
      vehicle_id: VEHICLE_ID,
      status: 'SCHEDULED',
      departure_time: new Date(Date.now() + 3600000).toISOString(),
      arrival_time_estimated: new Date(Date.now() + 7200000).toISOString(),
      total_seats_offered: 3,
      available_seats: 3,
      cost_per_seat_cents: 500,
      currency: 'USD',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.setRide(ride);

    const req: RideRequest = {
      id: requestId,
      organization_id: ORG_ID,
      ride_id: rideId,
      passenger_id: SARAH_ID,
      pickup_point_id: PICKUP_ID,
      drop_point_id: DROP_ID,
      requested_seats: 1,
      status: 'PENDING',
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.setRideRequest(req);

    const { request: rejectedReq } = await store.rejectRideRequestWithPessimisticLock(requestId, ALEX_ID);
    expect(rejectedReq.status).toBe('REJECTED');
    expect(rejectedReq.version).toBe(2);
  });
});
