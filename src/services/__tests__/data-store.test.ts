import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore } from '../data-store';
import { calculateHaversineDistanceMeters } from '../../domain/geo';
import { setupTestRepository, ORG_ID, ALEX_ID, EMILY_ID, SARAH_ID, DAVID_ID } from '../../../tests/helpers/seed-fixture';
import { RideRequest, RidePassenger } from '../../domain/types';

describe('DataStore and Corridor Search Services', () => {
  let store: DataStore;

  beforeEach(() => {
    store = setupTestRepository();
  });

  it('calculates geographic distance accurately using Haversine formula', () => {
    // Distance between SF (37.7749, -122.4194) and San Jose (37.3382, -121.8863) is approx ~68-70 km
    const dist = calculateHaversineDistanceMeters(37.7749, -122.4194, 37.3382, -121.8863);
    expect(dist).toBeGreaterThan(65000);
    expect(dist).toBeLessThan(75000);
  });

  it('finds scheduled rides along corridor matching pickup and drop waypoints', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateStr = tomorrow.toISOString().split('T')[0];

    // Commuter searching from Millbrae BART to Acme HQ Campus
    const results = await store.searchCorridorRides({
      orgId: ORG_ID,
      originLat: 37.5997, // Millbrae BART
      originLng: -122.3867,
      destLat: 37.422,    // Mountain View HQ
      destLng: -122.0841,
      date: tomorrowDateStr,
      seatsNeeded: 1,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].driver.full_name).toBe('Alex Rivera');
    expect(results[0].ride.available_seats).toBe(2);
    expect(results[0].nearestPickupDistanceMeters).toBeLessThan(100);
  });

  it('accepts a pending request atomically, updates manifest, and decreases seats', async () => {
    // The seed fixture has Sarah's pending request on Alex's ride (rideAId = bbbbbbbb...)
    const rideAId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const sarahReqId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    const initialRide = store.rides.get(rideAId)!;
    const initialSeats = initialRide.available_seats; // 2

    const { request, ride } = await store.acceptRideRequest(sarahReqId, ALEX_ID);

    expect(request.status).toBe('ACCEPTED');
    expect(ride.available_seats).toBe(initialSeats - 1);

    // Manifest entry created
    const manifest = Array.from(store.ridePassengers.values()).find(
      (p) => p.ride_request_id === sarahReqId
    );
    expect(manifest).toBeDefined();
    expect(manifest?.passenger_id).toBe(SARAH_ID);

    // Notification created
    const notifications = Array.from(store.notifications.values()).filter(
      (n) => n.user_id === SARAH_ID && n.type === 'REQUEST_ACCEPTED'
    );
    expect(notifications.length).toBe(1);
  });

  it('cancels an accepted request and atomically restores available seats', async () => {
    const rideAId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const sarahReqId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    // First accept the request so cancellation restores seats
    await store.acceptRideRequest(sarahReqId, ALEX_ID);
    const rideAfterAccept = store.rides.get(rideAId)!;
    const seatsAfterAccept = rideAfterAccept.available_seats; // 1

    const { request, ride } = await store.cancelRideRequest(sarahReqId, SARAH_ID, 'WFH today');

    expect(request.status).toBe('CANCELLED');
    expect(ride.available_seats).toBe(seatsAfterAccept + 1); // seat restored

    // Manifest entry removed
    const manifest = Array.from(store.ridePassengers.values()).find(
      (p) => p.ride_request_id === sarahReqId
    );
    expect(manifest).toBeUndefined();
  });

  it('cascades driver ride cancellation to all pending requests', async () => {
    const rideAId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const sarahReqId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

    await store.cancelRide(rideAId, ALEX_ID, 'Vehicle tire puncture');

    const updatedRide = store.rides.get(rideAId)!;
    expect(updatedRide.status).toBe('CANCELLED');
    expect(updatedRide.cancelled_reason).toBe('Vehicle tire puncture');

    // Sarah's request should now be CANCELLED
    const sarahReq = store.rideRequests.get(sarahReqId)!;
    expect(sarahReq.status).toBe('CANCELLED');
  });
});
