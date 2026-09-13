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
  private isProcessing: boolean = false;

  /**
   * Executes a single automated expiration sweep with re-entrancy protection and distributed locking
   */
  public async runCycle(now: Date = new Date()): Promise<ExpirationCycleReport> {
    const nowIso = now.toISOString();
    if (this.isProcessing) {
      return {
        timestamp: nowIso,
        expiredRequestsCount: 0,
        cancelledRidesCount: 0,
        processedRideIds: [],
      };
    }

    this.isProcessing = true;
    try {
      const store = getRepository();
      const lockAcquired = await store.acquireDistributedLock();
      if (!lockAcquired) {
        return {
          timestamp: nowIso,
          expiredRequestsCount: 0,
          cancelledRidesCount: 0,
          processedRideIds: [],
        };
      }

      try {
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
                const expired = await store.expirePendingRequest(request.id);
                if (expired) {
                  expiredRequestsCount++;
                  if (!processedRideIds.includes(ride.id)) {
                    processedRideIds.push(ride.id);
                  }
                }
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
              const cancelled = await store.autoCancelRide(ride.id, cancelReason);
              if (cancelled) {
                cancelledRidesCount++;
                if (!processedRideIds.includes(ride.id)) {
                  processedRideIds.push(ride.id);
                }
              }
            }
          }
        }

        return {
          timestamp: nowIso,
          expiredRequestsCount,
          cancelledRidesCount,
          processedRideIds,
        };
      } finally {
        await store.releaseDistributedLock();
      }
    } finally {
      this.isProcessing = false;
    }
  }
}

export const rideExpirationWorker = new RideExpirationWorker();
