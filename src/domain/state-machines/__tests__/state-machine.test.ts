import { describe, it, expect } from 'vitest';
import { Ride, RideRequest } from '../../types';
import {
  RideStateMachine,
  InvalidStateTransitionError,
} from '../ride-state-machine';
import { RideRequestStateMachine } from '../ride-request-state-machine';

const mockRide = (overrides: Partial<Ride> = {}): Ride => ({
  id: 'ride-123',
  organization_id: 'org-1',
  driver_id: 'driver-1',
  vehicle_id: 'veh-1',
  status: 'DRAFT',
  departure_time: '2026-09-10T08:00:00Z',
  arrival_time_estimated: '2026-09-10T09:00:00Z',
  total_seats_offered: 3,
  available_seats: 3,
  cost_per_seat_cents: 300,
  currency: 'USD',
  version: 1,
  created_at: '2026-09-09T12:00:00Z',
  updated_at: '2026-09-09T12:00:00Z',
  ...overrides,
});

const mockRequest = (overrides: Partial<RideRequest> = {}): RideRequest => ({
  id: 'req-456',
  organization_id: 'org-1',
  ride_id: 'ride-123',
  passenger_id: 'passenger-1',
  pickup_point_id: 'pickup-1',
  drop_point_id: 'drop-1',
  requested_seats: 1,
  status: 'PENDING',
  version: 1,
  created_at: '2026-09-09T12:30:00Z',
  updated_at: '2026-09-09T12:30:00Z',
  ...overrides,
});

describe('RideStateMachine', () => {
  it('transitions through happy path: DRAFT -> SCHEDULED -> IN_PROGRESS -> COMPLETED', () => {
    let ride = mockRide();
    expect(ride.status).toBe('DRAFT');

    ride = RideStateMachine.publish(ride);
    expect(ride.status).toBe('SCHEDULED');
    expect(ride.version).toBe(2);

    ride = RideStateMachine.startRide(ride);
    expect(ride.status).toBe('IN_PROGRESS');
    expect(ride.started_at).toBeDefined();
    expect(ride.version).toBe(3);

    ride = RideStateMachine.completeRide(ride);
    expect(ride.status).toBe('COMPLETED');
    expect(ride.completed_at).toBeDefined();
    expect(ride.version).toBe(4);
  });

  it('allows cancellation from SCHEDULED state with a reason', () => {
    const ride = mockRide({ status: 'SCHEDULED' });
    const cancelled = RideStateMachine.cancelRide(ride, 'Mechanical issue');
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.cancelled_reason).toBe('Mechanical issue');
    expect(cancelled.cancelled_at).toBeDefined();
  });

  it('rejects cancellation without a reason', () => {
    const ride = mockRide({ status: 'SCHEDULED' });
    expect(() => RideStateMachine.cancelRide(ride, '')).toThrow(
      'Cancellation reason is required.'
    );
  });

  it('prevents publishing a ride with zero available seats', () => {
    const ride = mockRide({ available_seats: 0 });
    expect(() => RideStateMachine.publish(ride)).toThrow(
      'Cannot publish a ride with zero available seats.'
    );
  });

  it('throws InvalidStateTransitionError on illegal transitions', () => {
    const ride = mockRide({ status: 'COMPLETED' });
    expect(() => RideStateMachine.publish(ride)).toThrow(
      InvalidStateTransitionError
    );
    expect(() => RideStateMachine.startRide(ride)).toThrow(
      InvalidStateTransitionError
    );
  });
});

describe('RideRequestStateMachine', () => {
  it('accepts request atomically and decrements available seats', () => {
    const ride = mockRide({ status: 'SCHEDULED', available_seats: 3 });
    const request = mockRequest({ requested_seats: 2 });

    const { updatedRequest, updatedRide } = RideRequestStateMachine.accept(
      request,
      ride
    );

    expect(updatedRequest.status).toBe('ACCEPTED');
    expect(updatedRequest.responded_at).toBeDefined();
    expect(updatedRide.available_seats).toBe(1); // 3 - 2 = 1
    expect(updatedRide.version).toBe(2);
  });

  it('throws error when trying to accept more seats than available (prevents double booking)', () => {
    const ride = mockRide({ status: 'SCHEDULED', available_seats: 1 });
    const request = mockRequest({ requested_seats: 2 });

    expect(() => RideRequestStateMachine.accept(request, ride)).toThrow(
      'Insufficient seats: requested 2, but only 1 available.'
    );
  });

  it('rejects request without modifying available seats', () => {
    const request = mockRequest();
    const rejected = RideRequestStateMachine.reject(request, 'Detour too far');

    expect(rejected.status).toBe('REJECTED');
    expect(rejected.rejection_reason).toBe('Detour too far');
  });

  it('restores seats when an ACCEPTED request is cancelled', () => {
    const ride = mockRide({ status: 'SCHEDULED', available_seats: 1, total_seats_offered: 3 });
    const request = mockRequest({ status: 'ACCEPTED', requested_seats: 2 });

    const { updatedRequest, updatedRide } = RideRequestStateMachine.cancel(
      request,
      ride,
      'Change of plans'
    );

    expect(updatedRequest.status).toBe('CANCELLED');
    expect(updatedRequest.cancellation_reason).toBe('Change of plans');
    expect(updatedRide.available_seats).toBe(3); // 1 + 2 = 3
  });

  it('does NOT increment seats if a PENDING request is cancelled before acceptance', () => {
    const ride = mockRide({ status: 'SCHEDULED', available_seats: 2, total_seats_offered: 3 });
    const request = mockRequest({ status: 'PENDING', requested_seats: 1 });

    const { updatedRequest, updatedRide } = RideRequestStateMachine.cancel(
      request,
      ride,
      'Found another ride'
    );

    expect(updatedRequest.status).toBe('CANCELLED');
    expect(updatedRide.available_seats).toBe(2); // Unchanged!
  });

  it('throws on illegal transitions from terminal states', () => {
    const request = mockRequest({ status: 'REJECTED' });
    const ride = mockRide({ status: 'SCHEDULED' });

    expect(() => RideRequestStateMachine.accept(request, ride)).toThrow(
      InvalidStateTransitionError
    );
  });
});
