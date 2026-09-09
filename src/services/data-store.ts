/**
 * Corporate Carpooling Platform: In-Memory Data Store & Spatial Services
 * Implements the 13 canonical tables and transactional operations defined in docs/DATABASE_SCHEMA.md
 */

import {
  Organization,
  User,
  UserCapability,
  UserLocation,
  Vehicle,
  Ride,
  RideRoute,
  RouteWaypoint,
  PickupPoint,
  DropPoint,
  RideRequest,
  RidePassenger,
  Notification,
  AuditLog,
  UUID,
} from '../domain/types';
import { RideStateMachine } from '../domain/state-machines/ride-state-machine';
import { RideRequestStateMachine } from '../domain/state-machines/ride-request-state-machine';

// ----------------------------------------------------------------------------
// Spatial Math: Haversine Formula for Distance in Meters
// ----------------------------------------------------------------------------
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

export class DataStore {
  public organizations: Map<UUID, Organization> = new Map();
  public users: Map<UUID, User> = new Map();
  public userCapabilities: Map<UUID, UserCapability> = new Map();
  public userLocations: Map<UUID, UserLocation> = new Map();
  public vehicles: Map<UUID, Vehicle> = new Map();
  public rides: Map<UUID, Ride> = new Map();
  public rideRoutes: Map<UUID, RideRoute> = new Map();
  public routeWaypoints: Map<UUID, RouteWaypoint> = new Map();
  public pickupPoints: Map<UUID, PickupPoint> = new Map();
  public dropPoints: Map<UUID, DropPoint> = new Map();
  public rideRequests: Map<UUID, RideRequest> = new Map();
  public ridePassengers: Map<UUID, RidePassenger> = new Map();
  public notifications: Map<UUID, Notification> = new Map();
  public auditLogs: AuditLog[] = [];

  private static instance: DataStore;

  public static getInstance(): DataStore {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore();
    }
    return DataStore.instance;
  }

  // --------------------------------------------------------------------------
  // Audit Logging Helper
  // --------------------------------------------------------------------------
  public logAudit(
    orgId: UUID,
    actorId: UUID | undefined,
    entityType: string,
    entityId: UUID,
    action: AuditLog['action'],
    fromState?: string,
    toState?: string,
    metadata: Record<string, unknown> = {}
  ): void {
    const log: AuditLog = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      actor_user_id: actorId,
      entity_type: entityType,
      entity_id: entityId,
      action,
      from_state: fromState,
      to_state: toState,
      metadata_json: metadata,
      ip_address: '127.0.0.1',
      user_agent: 'CorporateWeb/1.0',
      created_at: new Date().toISOString(),
    };
    this.auditLogs.unshift(log);
  }

  // --------------------------------------------------------------------------
  // Notification Dispatcher
  // --------------------------------------------------------------------------
  public dispatchNotification(
    orgId: UUID,
    userId: UUID,
    type: Notification['type'],
    title: string,
    body: string,
    payload: Record<string, unknown> = {}
  ): void {
    const notification: Notification = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      user_id: userId,
      type,
      channel: 'IN_APP',
      title,
      body,
      payload_json: payload,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    this.notifications.set(notification.id, notification);
  }

  // --------------------------------------------------------------------------
  // Corridor Search Query (Matches docs/ARCHITECTURE.md)
  // --------------------------------------------------------------------------
  public searchCorridorRides(params: {
    orgId: UUID;
    originLat: number;
    originLng: number;
    destLat: number;
    destLng: number;
    date: string; // YYYY-MM-DD
    seatsNeeded?: number;
    maxDetourMeters?: number;
  }) {
    const {
      orgId,
      originLat,
      originLng,
      destLat,
      destLng,
      date,
      seatsNeeded = 1,
      maxDetourMeters = 3000,
    } = params;

    const results: Array<{
      ride: Ride;
      driver: User;
      vehicle: Vehicle;
      route: RideRoute;
      waypoints: RouteWaypoint[];
      nearestPickupDistanceMeters: number;
      nearestDropDistanceMeters: number;
    }> = [];

    const allRides = Array.from(this.rides.values()).filter(
      (r) =>
        r.organization_id === orgId &&
        r.status === 'SCHEDULED' &&
        r.available_seats >= seatsNeeded &&
        r.departure_time.startsWith(date)
    );

    for (const ride of allRides) {
      const route = Array.from(this.rideRoutes.values()).find(
        (rr) => rr.ride_id === ride.id
      );
      if (!route) continue;

      // 1. Bounding box check (expanded by ~0.05 degrees for corridor tolerance)
      const buffer = 0.05;
      const inBBox =
        originLat >= route.min_latitude - buffer &&
        originLat <= route.max_latitude + buffer &&
        originLng >= route.min_longitude - buffer &&
        originLng <= route.max_longitude + buffer;

      if (!inBBox) continue;

      // 2. Structured waypoint proximity scan
      const waypoints = Array.from(this.routeWaypoints.values())
        .filter((w) => w.route_id === route.id)
        .sort((a, b) => a.stop_order - b.stop_order);

      let minPickupDist = Infinity;
      let minDropDist = Infinity;

      for (const wp of waypoints) {
        const dPickup = calculateHaversineDistanceMeters(
          originLat,
          originLng,
          wp.latitude,
          wp.longitude
        );
        if (dPickup < minPickupDist) minPickupDist = dPickup;

        const dDrop = calculateHaversineDistanceMeters(
          destLat,
          destLng,
          wp.latitude,
          wp.longitude
        );
        if (dDrop < minDropDist) minDropDist = dDrop;
      }

      if (minPickupDist <= maxDetourMeters && minDropDist <= maxDetourMeters) {
        const driver = this.users.get(ride.driver_id)!;
        const vehicle = this.vehicles.get(ride.vehicle_id)!;

        results.push({
          ride,
          driver,
          vehicle,
          route,
          waypoints,
          nearestPickupDistanceMeters: minPickupDist,
          nearestDropDistanceMeters: minDropDist,
        });
      }
    }

    return results;
  }

  // --------------------------------------------------------------------------
  // Transactional Actions (State Machine Integrations)
  // --------------------------------------------------------------------------

  public acceptRideRequest(requestId: UUID, actorId: UUID): { request: RideRequest; ride: Ride } {
    const request = this.rideRequests.get(requestId);
    if (!request) throw new Error('Ride request not found.');

    const ride = this.rides.get(request.ride_id);
    if (!ride) throw new Error('Associated ride not found.');

    if (ride.driver_id !== actorId) {
      throw new Error('Unauthorized: Only the ride host can approve requests.');
    }

    // Atomic state machine transition & seat deduction
    const { updatedRequest, updatedRide } = RideRequestStateMachine.accept(request, ride);

    this.rides.set(updatedRide.id, updatedRide);
    this.rideRequests.set(updatedRequest.id, updatedRequest);

    // Create manifest entry
    const passengerEntry: RidePassenger = {
      id: crypto.randomUUID(),
      organization_id: ride.organization_id,
      ride_id: ride.id,
      ride_request_id: request.id,
      passenger_id: request.passenger_id,
      seats_booked: request.requested_seats,
      created_at: new Date().toISOString(),
    };
    this.ridePassengers.set(passengerEntry.id, passengerEntry);

    // Audit log
    this.logAudit(
      ride.organization_id,
      actorId,
      'RIDE_REQUEST',
      request.id,
      'STATE_TRANSITION',
      request.status,
      updatedRequest.status,
      { seats_allocated: request.requested_seats, remaining_seats: updatedRide.available_seats }
    );

    // Notification to passenger
    this.dispatchNotification(
      ride.organization_id,
      request.passenger_id,
      'REQUEST_ACCEPTED',
      'Ride Request Confirmed!',
      `Your host has confirmed your seat for the commute on ${new Date(ride.departure_time).toLocaleDateString()}.`,
      { ride_id: ride.id, request_id: request.id }
    );

    return { request: updatedRequest, ride: updatedRide };
  }

  public rejectRideRequest(requestId: UUID, actorId: UUID, reason?: string): RideRequest {
    const request = this.rideRequests.get(requestId);
    if (!request) throw new Error('Ride request not found.');

    const ride = this.rides.get(request.ride_id);
    if (!ride) throw new Error('Associated ride not found.');

    if (ride.driver_id !== actorId) {
      throw new Error('Unauthorized: Only the ride host can reject requests.');
    }

    const updatedRequest = RideRequestStateMachine.reject(request, reason);
    this.rideRequests.set(updatedRequest.id, updatedRequest);

    this.logAudit(
      ride.organization_id,
      actorId,
      'RIDE_REQUEST',
      request.id,
      'STATE_TRANSITION',
      request.status,
      updatedRequest.status,
      { rejection_reason: reason }
    );

    this.dispatchNotification(
      ride.organization_id,
      request.passenger_id,
      'REQUEST_REJECTED',
      'Ride Request Declined',
      reason ? `Host declined: ${reason}` : 'Host declined this request due to route detour.',
      { ride_id: ride.id, request_id: request.id }
    );

    return updatedRequest;
  }

  public cancelRideRequest(requestId: UUID, actorId: UUID, reason?: string): { request: RideRequest; ride: Ride } {
    const request = this.rideRequests.get(requestId);
    if (!request) throw new Error('Ride request not found.');

    const ride = this.rides.get(request.ride_id);
    if (!ride) throw new Error('Associated ride not found.');

    if (request.passenger_id !== actorId && ride.driver_id !== actorId) {
      throw new Error('Unauthorized: Only the passenger or driver can cancel this request.');
    }

    const wasAccepted = request.status === 'ACCEPTED';
    const { updatedRequest, updatedRide } = RideRequestStateMachine.cancel(request, ride, reason);

    this.rides.set(updatedRide.id, updatedRide);
    this.rideRequests.set(updatedRequest.id, updatedRequest);

    if (wasAccepted) {
      // Remove from manifest
      for (const [key, p] of this.ridePassengers.entries()) {
        if (p.ride_request_id === request.id) {
          this.ridePassengers.delete(key);
        }
      }
    }

    this.logAudit(
      ride.organization_id,
      actorId,
      'RIDE_REQUEST',
      request.id,
      'CANCEL',
      request.status,
      updatedRequest.status,
      { cancellation_reason: reason, seats_restored: wasAccepted ? request.requested_seats : 0 }
    );

    // Notify counterpart
    const recipientId = actorId === request.passenger_id ? ride.driver_id : request.passenger_id;
    this.dispatchNotification(
      ride.organization_id,
      recipientId,
      'REQUEST_CANCELLED',
      'Carpool Booking Cancelled',
      reason ? `Booking cancelled: ${reason}` : 'A carpool seat booking was cancelled.',
      { ride_id: ride.id, request_id: request.id }
    );

    return { request: updatedRequest, ride: updatedRide };
  }

  public startRide(rideId: UUID, actorId: UUID): Ride {
    const ride = this.rides.get(rideId);
    if (!ride) throw new Error('Ride not found.');
    if (ride.driver_id !== actorId) throw new Error('Unauthorized.');

    const updatedRide = RideStateMachine.startRide(ride);
    this.rides.set(updatedRide.id, updatedRide);

    this.logAudit(
      ride.organization_id,
      actorId,
      'RIDE',
      ride.id,
      'STATE_TRANSITION',
      ride.status,
      updatedRide.status
    );

    // Notify all accepted passengers
    const acceptedRequests = Array.from(this.rideRequests.values()).filter(
      (r) => r.ride_id === rideId && r.status === 'ACCEPTED'
    );

    for (const req of acceptedRequests) {
      this.dispatchNotification(
        ride.organization_id,
        req.passenger_id,
        'RIDE_STARTED',
        'Your Ride Has Started!',
        'Your driver has departed. Please be ready at your designated pickup point.',
        { ride_id: ride.id }
      );
    }

    return updatedRide;
  }

  public completeRide(rideId: UUID, actorId: UUID): Ride {
    const ride = this.rides.get(rideId);
    if (!ride) throw new Error('Ride not found.');
    if (ride.driver_id !== actorId) throw new Error('Unauthorized.');

    const updatedRide = RideStateMachine.completeRide(ride);
    this.rides.set(updatedRide.id, updatedRide);

    // Complete all accepted requests
    for (const req of this.rideRequests.values()) {
      if (req.ride_id === rideId && req.status === 'ACCEPTED') {
        const completedReq = RideRequestStateMachine.complete(req);
        this.rideRequests.set(completedReq.id, completedReq);
      }
    }

    this.logAudit(
      ride.organization_id,
      actorId,
      'RIDE',
      ride.id,
      'STATE_TRANSITION',
      ride.status,
      updatedRide.status
    );

    return updatedRide;
  }

  public cancelRide(rideId: UUID, actorId: UUID, reason: string): Ride {
    const ride = this.rides.get(rideId);
    if (!ride) throw new Error('Ride not found.');
    if (ride.driver_id !== actorId) throw new Error('Unauthorized.');

    const updatedRide = RideStateMachine.cancelRide(ride, reason);
    this.rides.set(updatedRide.id, updatedRide);

    // Cascade cancellation to all pending and accepted requests
    for (const req of this.rideRequests.values()) {
      if (req.ride_id === rideId && (req.status === 'PENDING' || req.status === 'ACCEPTED')) {
        const { updatedRequest } = RideRequestStateMachine.cancel(
          req,
          ride,
          `Driver cancelled trip: ${reason}`
        );
        this.rideRequests.set(updatedRequest.id, updatedRequest);

        this.dispatchNotification(
          ride.organization_id,
          req.passenger_id,
          'RIDE_CANCELLED',
          'Ride Cancelled by Host',
          `The ride scheduled for ${new Date(ride.departure_time).toLocaleTimeString()} was cancelled: ${reason}`,
          { ride_id: ride.id }
        );
      }
    }

    this.logAudit(
      ride.organization_id,
      actorId,
      'RIDE',
      ride.id,
      'CANCEL',
      ride.status,
      updatedRide.status,
      { cancelled_reason: reason }
    );

    return updatedRide;
  }
}
