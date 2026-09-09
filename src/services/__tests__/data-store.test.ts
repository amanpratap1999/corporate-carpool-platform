import { describe, it, expect, beforeEach } from 'vitest';
import { DataStore, calculateHaversineDistanceMeters } from '../data-store';
import { initializeSeedData } from '../seed-data';

describe('DataStore and Corridor Search Services', () => {
  let store: DataStore;
  const orgId = '11111111-1111-4111-8111-111111111111';
  const alexId = '22222222-2222-4222-8222-222222222222';
  const emilyId = '55555555-5555-4555-8555-555555555555';

  beforeEach(() => {
    // Reset singleton instance for test isolation
    // @ts-expect-error reset singleton
    DataStore.instance = null;
    store = initializeSeedData();
  });

  it('calculates geographic distance accurately using Haversine formula', () => {
    // Distance between SF (37.7749, -122.4194) and San Jose (37.3382, -121.8863) is approx ~68-70 km
    const dist = calculateHaversineDistanceMeters(
      37.7749,
      -122.4194,
      37.3382,
      -121.8863
    );
    expect(dist).toBeGreaterThan(65000);
    expect(dist).toBeLessThan(75000);
  });

  it('finds scheduled rides along corridor matching pickup and drop waypoints', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowDateStr = tomorrow.toISOString().split('T')[0];

    // Commuter searching from Millbrae BART to Acme HQ Campus
    const results = store.searchCorridorRides({
      orgId,
      originLat: 37.5997, // Millbrae
      originLng: -122.3867,
      destLat: 37.422, // Mountain View HQ
      destLng: -122.0841,
      date: tomorrowDateStr,
      seatsNeeded: 1,
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].driver.full_name).toBe('Alex Rivera');
    expect(results[0].ride.available_seats).toBe(2);
    expect(results[0].nearestPickupDistanceMeters).toBeLessThan(100);
  });

  it('accepts a pending request atomically, updates manifest, and decreases seats', () => {
    const emilyReqId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const initialRide = store.rides.get('99999999-9999-4999-8999-999999999999')!;
    const initialSeats = initialRide.available_seats;

    const { request, ride } = store.acceptRideRequest(emilyReqId, alexId);

    expect(request.status).toBe('ACCEPTED');
    expect(ride.available_seats).toBe(initialSeats - 1);

    // Manifest entry created
    const manifest = Array.from(store.ridePassengers.values()).find(
      (p) => p.ride_request_id === emilyReqId
    );
    expect(manifest).toBeDefined();
    expect(manifest?.passenger_id).toBe(emilyId);

    // Notification created
    const notifications = Array.from(store.notifications.values()).filter(
      (n) => n.user_id === emilyId && n.type === 'REQUEST_ACCEPTED'
    );
    expect(notifications.length).toBe(1);
  });

  it('cancels an accepted request and atomically restores available seats', () => {
    const davidReqId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const initialRide = store.rides.get('99999999-9999-4999-8999-999999999999')!;
    const initialSeats = initialRide.available_seats; // 2 seats

    const { request, ride } = store.cancelRideRequest(
      davidReqId,
      '44444444-4444-4444-8444-444444444444', // David Kim
      'WFH today'
    );

    expect(request.status).toBe('CANCELLED');
    expect(ride.available_seats).toBe(initialSeats + 1); // 2 + 1 = 3 seats!

    // Manifest entry removed
    const manifest = Array.from(store.ridePassengers.values()).find(
      (p) => p.ride_request_id === davidReqId
    );
    expect(manifest).toBeUndefined();
  });

  it('cascades driver ride cancellation to all pending and accepted requests', () => {
    const rideId = '99999999-9999-4999-8999-999999999999';

    store.cancelRide(rideId, alexId, 'Vehicle tire puncture');

    const updatedRide = store.rides.get(rideId)!;
    expect(updatedRide.status).toBe('CANCELLED');
    expect(updatedRide.cancelled_reason).toBe('Vehicle tire puncture');

    // Both David's and Emily's requests should now be CANCELLED
    const davidReq = store.rideRequests.get('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')!;
    const emilyReq = store.rideRequests.get('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')!;

    expect(davidReq.status).toBe('CANCELLED');
    expect(emilyReq.status).toBe('CANCELLED');
  });
});
