/**
 * Explicit Finite State Machine for Ride Request Lifecycle
 * Aligned with docs/ARCHITECTURE.md
 */

import { Ride, RideRequest, RideRequestStatus } from '../types';
import { InvalidStateTransitionError } from './ride-state-machine';

export interface AcceptResult {
  updatedRequest: RideRequest;
  updatedRide: Ride;
}

export interface CancelResult {
  updatedRequest: RideRequest;
  updatedRide: Ride;
}

export class RideRequestStateMachine {
  private static readonly TRANSITIONS: Record<RideRequestStatus, RideRequestStatus[]> = {
    PENDING: ['ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED'],
    ACCEPTED: ['CANCELLED', 'COMPLETED'],
    REJECTED: [],
    CANCELLED: [],
    EXPIRED: [],
    COMPLETED: [],
  };

  public static canTransition(from: RideRequestStatus, to: RideRequestStatus): boolean {
    const allowed = this.TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  public static assertCanTransition(from: RideRequestStatus, to: RideRequestStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(
        'RideRequest',
        from,
        to,
        this.TRANSITIONS[from] || []
      );
    }
  }

  /**
   * Driver approves request: atomically decrements ride.available_seats
   * and transitions request to ACCEPTED.
   */
  public static accept(request: RideRequest, ride: Ride): AcceptResult {
    this.assertCanTransition(request.status, 'ACCEPTED');

    if (ride.id !== request.ride_id) {
      throw new Error(`Mismatched ride_id: request references ${request.ride_id}, but ride is ${ride.id}`);
    }

    if (ride.status !== 'SCHEDULED') {
      throw new Error(`Cannot accept request for a ride in '${ride.status}' status. Must be 'SCHEDULED'.`);
    }

    if (ride.available_seats < request.requested_seats) {
      throw new Error(
        `Insufficient seats: requested ${request.requested_seats}, but only ${ride.available_seats} available.`
      );
    }

    const updatedRide: Ride = {
      ...ride,
      available_seats: ride.available_seats - request.requested_seats,
      version: ride.version + 1,
      updated_at: new Date().toISOString(),
    };

    const updatedRequest: RideRequest = {
      ...request,
      status: 'ACCEPTED',
      responded_at: new Date().toISOString(),
      version: request.version + 1,
      updated_at: new Date().toISOString(),
    };

    return { updatedRequest, updatedRide };
  }

  /**
   * Driver declines request: transitions request to REJECTED.
   * Ride available seats are unmodified.
   */
  public static reject(request: RideRequest, reason?: string): RideRequest {
    this.assertCanTransition(request.status, 'REJECTED');

    return {
      ...request,
      status: 'REJECTED',
      rejection_reason: reason?.trim(),
      responded_at: new Date().toISOString(),
      version: request.version + 1,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Rider or Driver cancels request:
   * If previously ACCEPTED, atomically restores seats back to the ride.
   */
  public static cancel(
    request: RideRequest,
    ride: Ride,
    reason?: string
  ): CancelResult {
    this.assertCanTransition(request.status, 'CANCELLED');

    if (ride.id !== request.ride_id) {
      throw new Error(`Mismatched ride_id: request references ${request.ride_id}, but ride is ${ride.id}`);
    }

    let updatedRide = ride;

    // If seats were already allocated (request was ACCEPTED), restore them!
    if (request.status === 'ACCEPTED') {
      const restoredSeats = ride.available_seats + request.requested_seats;
      if (restoredSeats > ride.total_seats_offered) {
        throw new Error(
          `Seat restoration overflow: cannot restore ${request.requested_seats} seats beyond total offered (${ride.total_seats_offered}).`
        );
      }

      updatedRide = {
        ...ride,
        available_seats: restoredSeats,
        version: ride.version + 1,
        updated_at: new Date().toISOString(),
      };
    }

    const updatedRequest: RideRequest = {
      ...request,
      status: 'CANCELLED',
      cancellation_reason: reason?.trim(),
      cancelled_at: new Date().toISOString(),
      version: request.version + 1,
      updated_at: new Date().toISOString(),
    };

    return { updatedRequest, updatedRide };
  }

  /**
   * Ride completed: passenger's confirmed request is marked COMPLETED.
   */
  public static complete(request: RideRequest): RideRequest {
    this.assertCanTransition(request.status, 'COMPLETED');

    return {
      ...request,
      status: 'COMPLETED',
      version: request.version + 1,
      updated_at: new Date().toISOString(),
    };
  }
}
