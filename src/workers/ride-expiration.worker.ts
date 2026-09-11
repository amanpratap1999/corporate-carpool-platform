/**
 * Background Expiration Worker
 * Periodically scans for:
 * 1. Stale pending seat requests on rides that have already departed -> transitions to EXPIRED
 * 2. Un-started SCHEDULED rides past departure + 30m -> transitions to CANCELLED
 * Dispatches notifications and audit logs for all transitions.
 */

import { getRepository } from '../services/repository-factory';
import { RideRequestStateMachine } from '../domain/state-machines/ride-request-state-machine';
import { RideStateMachine } from '../domain/state-machines/ride-state-machine';

export interface ExpirationCycleReport {
  timestamp: string;
  expiredRequestsCount: number;
  cancelledRidesCount: number;
  processedRideIds: string[];
}

export class RideExpirationWorker {
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  /**
   * Executes a single automated expiration sweep
   */
  public async runCycle(now: Date = new Date()): Promise<ExpirationCycleReport> {
    const store = getRepository();
    const nowIso = now.toISOString();
    const nowMs = now.getTime();
    const thirtyMinutesMs = 30 * 60 * 1000;

    let expiredRequestsCount = 0;
    let cancelledRidesCount = 0;
    const processedRideIds: string[] = [];

    // ------------------------------------------------------------------------
    // 1. Expire stale PENDING requests on departed rides
    // ------------------------------------------------------------------------
    for (const request of (await store.getAllRideRequests())) {
      if (request.status === 'PENDING') {
        const ride = await store.getRide(request.ride_id);
        if (ride) {
          const departureMs = new Date(ride.departure_time).getTime();
          if (departureMs < nowMs) {
            // Ride has already departed! Transition request to EXPIRED
            const updatedRequest = RideRequestStateMachine.expire(request);
            await store.setRideRequest(updatedRequest);
            expiredRequestsCount++;
            if (!processedRideIds.includes(ride.id)) {
              processedRideIds.push(ride.id);
            }

            await store.logAudit(
              ride.organization_id,
              'SYSTEM_WORKER',
              'RIDE_REQUEST',
              request.id,
              'STATE_TRANSITION',
              'PENDING',
              'EXPIRED',
              { reason: 'Auto-expired: Trip departure time passed without driver approval' }
            );

            await store.dispatchNotification(
              ride.organization_id,
              request.passenger_id,
              'SYSTEM_ANNOUNCEMENT',
              'Seat Request Expired',
              'Your seat request has expired because the trip departed without being confirmed.',
              { ride_id: ride.id, request_id: request.id }
            );
          }
        }
      }
    }

    // ------------------------------------------------------------------------
    // 2. Auto-cancel SCHEDULED rides not started within 30 mins of departure
    // ------------------------------------------------------------------------
    for (const ride of (await store.getAllRides())) {
      if (ride.status === 'SCHEDULED') {
        const departureMs = new Date(ride.departure_time).getTime();
        if (nowMs - departureMs > thirtyMinutesMs) {
          const cancelReason = 'System Auto-Expire: Driver did not initiate trip within 30 minutes of departure';
          const updatedRide = RideStateMachine.cancelRide(ride, cancelReason);
          await store.setRide(updatedRide);
          cancelledRidesCount++;
          if (!processedRideIds.includes(ride.id)) {
            processedRideIds.push(ride.id);
          }

          // Cancel any remaining accepted or pending requests for this ride
          for (const req of (await store.getAllRideRequests())) {
            if (req.ride_id === ride.id && (req.status === 'PENDING' || req.status === 'ACCEPTED')) {
              const { updatedRequest } = RideRequestStateMachine.cancel(req, ride, cancelReason);
              await store.setRideRequest(updatedRequest);

              await store.dispatchNotification(
                ride.organization_id,
                req.passenger_id,
                'RIDE_CANCELLED',
                'Carpool Cancelled by System',
                'The carpool was automatically cancelled because the driver did not start the trip.',
                { ride_id: ride.id }
              );
            }
          }

          await store.logAudit(
            ride.organization_id,
            'SYSTEM_WORKER',
            'RIDE',
            ride.id,
            'CANCEL',
            'SCHEDULED',
            'CANCELLED',
            { reason: cancelReason }
          );

          // Alert driver
          await store.dispatchNotification(
            ride.organization_id,
            ride.driver_id,
            'RIDE_CANCELLED',
            'Trip Auto-Cancelled',
            'Your scheduled carpool was marked cancelled because it was not started within 30 minutes of departure.',
            { ride_id: ride.id }
          );
        }
      }
    }

    return {
      timestamp: nowIso,
      expiredRequestsCount,
      cancelledRidesCount,
      processedRideIds,
    };
  }

  public start(intervalMs: number = 60000): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.timer = setInterval(() => {
      this.runCycle().catch((err) => {
        console.error('Error during ride expiration cycle:', err);
      });
    }, intervalMs);

    if (this.timer.unref) {
      this.timer.unref();
    }
  }

  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunning = false;
  }
}

export const rideExpirationWorker = new RideExpirationWorker();
