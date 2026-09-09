/**
 * Explicit Finite State Machine for Ride Lifecycle
 * Aligned with docs/ARCHITECTURE.md
 */

import { Ride, RideStatus } from '../types';

export class InvalidStateTransitionError extends Error {
  constructor(
    public readonly entity: string,
    public readonly currentState: string,
    public readonly targetState: string,
    public readonly allowedTransitions: string[]
  ) {
    super(
      `Invalid ${entity} transition from '${currentState}' to '${targetState}'. Allowed transitions from '${currentState}': [${allowedTransitions.join(
        ', '
      )}]`
    );
    this.name = 'InvalidStateTransitionError';
  }
}

export class RideStateMachine {
  private static readonly TRANSITIONS: Record<RideStatus, RideStatus[]> = {
    DRAFT: ['SCHEDULED', 'CANCELLED'],
    SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
    IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };

  public static canTransition(from: RideStatus, to: RideStatus): boolean {
    const allowed = this.TRANSITIONS[from] || [];
    return allowed.includes(to);
  }

  public static assertCanTransition(from: RideStatus, to: RideStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(
        'Ride',
        from,
        to,
        this.TRANSITIONS[from] || []
      );
    }
  }

  public static publish(ride: Ride): Ride {
    this.assertCanTransition(ride.status, 'SCHEDULED');

    if (ride.available_seats <= 0) {
      throw new Error('Cannot publish a ride with zero available seats.');
    }
    if (ride.available_seats > ride.total_seats_offered) {
      throw new Error('Available seats cannot exceed total seats offered.');
    }

    return {
      ...ride,
      status: 'SCHEDULED',
      version: ride.version + 1,
      updated_at: new Date().toISOString(),
    };
  }

  public static startRide(ride: Ride): Ride {
    this.assertCanTransition(ride.status, 'IN_PROGRESS');

    return {
      ...ride,
      status: 'IN_PROGRESS',
      started_at: new Date().toISOString(),
      version: ride.version + 1,
      updated_at: new Date().toISOString(),
    };
  }

  public static completeRide(ride: Ride): Ride {
    this.assertCanTransition(ride.status, 'COMPLETED');

    return {
      ...ride,
      status: 'COMPLETED',
      completed_at: new Date().toISOString(),
      version: ride.version + 1,
      updated_at: new Date().toISOString(),
    };
  }

  public static cancelRide(ride: Ride, reason: string): Ride {
    this.assertCanTransition(ride.status, 'CANCELLED');

    if (!reason || reason.trim().length === 0) {
      throw new Error('Cancellation reason is required.');
    }

    return {
      ...ride,
      status: 'CANCELLED',
      cancelled_reason: reason.trim(),
      cancelled_at: new Date().toISOString(),
      version: ride.version + 1,
      updated_at: new Date().toISOString(),
    };
  }
}
