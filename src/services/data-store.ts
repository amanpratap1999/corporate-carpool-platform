import { calculateHaversineDistanceMeters } from '../domain/geo';
import { isSameServiceDate, isRideOnServiceDate, matchCorridor, SearchDiagnostics } from '../domain/routing/corridor-matcher';
/**
 * Corporate Carpooling Platform: In-Memory Data Store & Spatial Services
 * Implements the 14 canonical tables and transactional operations defined in docs/DATABASE_SCHEMA.md
 * Used as a fast in-memory test double; production code must use PostgresStore via getRepository().
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
import { IDataRepository, CorridorSearchResult, ActivationError } from './repository.interface';
import crypto from 'node:crypto';



export class DataStore implements IDataRepository {
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
  private locks: Map<string, Promise<void>> = new Map();

  public static getInstance(): DataStore {
    if (!DataStore.instance) {
      DataStore.instance = new DataStore();
    }
    return DataStore.instance;
  }

  public async acquireLock(key: string): Promise<() => void> {
    while (this.locks.has(key)) {
      await this.locks.get(key);
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      resolveLock = resolve;
    });
    this.locks.set(key, lockPromise);

    return () => {
      this.locks.delete(key);
      resolveLock();
    };
  }

  // --------------------------------------------------------------------------
  // IDataRepository — Simple async Map wrappers
  // --------------------------------------------------------------------------

  async getOrganization(id: UUID): Promise<Organization | undefined> { return this.organizations.get(id); }
  async getAllOrganizations(): Promise<Organization[]> { return Array.from(this.organizations.values()); }
  async setOrganization(item: Organization): Promise<void> { this.organizations.set(item.id, item); }

  async getUser(id: UUID): Promise<User | undefined> { return this.users.get(id); }
  async getUserByEmail(email: string): Promise<User | undefined> {
    const normalized = email.toLowerCase().trim();
    for (const u of this.users.values()) {
      if (u.email.toLowerCase().trim() === normalized) {
        return u;
      }
    }
    return undefined;
  }
  async getAllUsers(): Promise<User[]> { return Array.from(this.users.values()); }
  async setUser(item: User): Promise<void> { this.users.set(item.id, item); }

  async getUserCapability(userId: UUID): Promise<UserCapability | undefined> { return this.userCapabilities.get(userId); }
  async setUserCapability(item: UserCapability): Promise<void> { this.userCapabilities.set(item.user_id, item); }

  async getAllUserLocations(): Promise<UserLocation[]> { return Array.from(this.userLocations.values()); }
  async setUserLocation(item: UserLocation): Promise<void> { this.userLocations.set(item.id, item); }

  async getVehicle(id: UUID): Promise<Vehicle | undefined> { return this.vehicles.get(id); }
  async getAllVehicles(): Promise<Vehicle[]> { return Array.from(this.vehicles.values()); }
  async setVehicle(item: Vehicle): Promise<void> { this.vehicles.set(item.id, item); }

  async getRide(id: UUID): Promise<Ride | undefined> { return this.rides.get(id); }
  async getAllRides(): Promise<Ride[]> { return Array.from(this.rides.values()); }
  async setRide(item: Ride): Promise<void> { this.rides.set(item.id, item); }

  async getRideRoute(id: UUID): Promise<RideRoute | undefined> { return this.rideRoutes.get(id); }
  async getAllRideRoutes(): Promise<RideRoute[]> { return Array.from(this.rideRoutes.values()); }
  async setRideRoute(item: RideRoute): Promise<void> { this.rideRoutes.set(item.id, item); }

  async getAllRouteWaypoints(): Promise<RouteWaypoint[]> { return Array.from(this.routeWaypoints.values()); }
  async setRouteWaypoint(item: RouteWaypoint): Promise<void> { this.routeWaypoints.set(item.id, item); }

  async getPickupPoint(id: UUID): Promise<PickupPoint | undefined> { return this.pickupPoints.get(id); }
  async getAllPickupPoints(): Promise<PickupPoint[]> { return Array.from(this.pickupPoints.values()); }
  async setPickupPoint(item: PickupPoint): Promise<void> { this.pickupPoints.set(item.id, item); }

  async getDropPoint(id: UUID): Promise<DropPoint | undefined> { return this.dropPoints.get(id); }
  async getAllDropPoints(): Promise<DropPoint[]> { return Array.from(this.dropPoints.values()); }
  async setDropPoint(item: DropPoint): Promise<void> { this.dropPoints.set(item.id, item); }

  async getRideRequest(id: UUID): Promise<RideRequest | undefined> { return this.rideRequests.get(id); }
  async getAllRideRequests(): Promise<RideRequest[]> { return Array.from(this.rideRequests.values()); }
  async setRideRequest(item: RideRequest): Promise<void> { this.rideRequests.set(item.id, item); }

  async getAllRidePassengers(): Promise<RidePassenger[]> { return Array.from(this.ridePassengers.values()); }
  async setRidePassenger(item: RidePassenger): Promise<void> { this.ridePassengers.set(item.id, item); }
  async deleteRidePassengerByRequestId(requestId: UUID): Promise<void> {
    for (const [key, p] of this.ridePassengers.entries()) {
      if (p.ride_request_id === requestId) { this.ridePassengers.delete(key); }
    }
  }

  async getNotification(id: UUID): Promise<Notification | undefined> { return this.notifications.get(id); }
  async getAllNotifications(): Promise<Notification[]> { return Array.from(this.notifications.values()); }
  async setNotification(item: Notification): Promise<void> { this.notifications.set(item.id, item); }

  async getAllAuditLogs(): Promise<AuditLog[]> { return [...this.auditLogs]; }
  async appendAuditLog(item: AuditLog): Promise<void> { this.auditLogs.unshift(item); }

  // --------------------------------------------------------------------------
  // Audit & Notification helpers (async — satisfies IDataRepository)
  // --------------------------------------------------------------------------
  public async logAudit(
    orgId: UUID,
    actorId: UUID | undefined,
    entityType: string,
    entityId: UUID,
    action: AuditLog['action'],
    fromState?: string,
    toState?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
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

  public async dispatchNotification(
    orgId: UUID,
    userId: UUID,
    type: Notification['type'],
    title: string,
    body: string,
    payload: Record<string, unknown> = {}
  ): Promise<void> {
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
  // Corridor Search Query (async — satisfies IDataRepository)
  // --------------------------------------------------------------------------
  public async searchCorridorRides(params: {
    orgId: UUID;
    originLat: number;
    originLng: number;
    destLat: number;
    destLng: number;
    date: string;
    timeZone?: string;
    dateStartUtc?: string;
    dateEndUtc?: string;
    windowStartUtc?: string;
    windowEndUtc?: string;
    seatsNeeded?: number;
    maxDetourMeters?: number;
  }): Promise<CorridorSearchResult[]> {
    const {
      orgId,
      originLat,
      originLng,
      destLat,
      destLng,
      date,
      timeZone,
      dateStartUtc,
      dateEndUtc,
      windowStartUtc,
      windowEndUtc,
      seatsNeeded = 1,
      maxDetourMeters = 3000,
    } = params;

    // 1. Organization & SCHEDULED filter
    const orgScheduledRides = Array.from(this.rides.values()).filter(
      (r) => r.organization_id === orgId && r.status === 'SCHEDULED'
    );

    // 2. Service date filter: UTC start to UTC next-day start
    const dateMatchingRides = orgScheduledRides.filter((r) =>
      isRideOnServiceDate(r.departure_time, date, timeZone, dateStartUtc, dateEndUtc)
    );

    // 3. Seat availability filter
    const seatMatchingRides = dateMatchingRides.filter((r) => r.available_seats >= seatsNeeded);

    // 4. Corridor matching (both pickup AND drop must be within maxDetourMeters)
    const corridorMatchingResults: CorridorSearchResult[] = [];
    for (const ride of seatMatchingRides) {
      const route = Array.from(this.rideRoutes.values()).find((rr) => rr.ride_id === ride.id);
      if (!route) continue;

      const waypoints = Array.from(this.routeWaypoints.values())
        .filter((w) => w.route_id === route.id)
        .sort((a, b) => a.stop_order - b.stop_order);

      const corridorResult = matchCorridor(
        route,
        waypoints,
        { latitude: originLat, longitude: originLng },
        { latitude: destLat, longitude: destLng },
        maxDetourMeters
      );

      if (corridorResult.matches) {
        const driver = this.users.get(ride.driver_id);
        const vehicle = this.vehicles.get(ride.vehicle_id);
        if (!driver || !vehicle) continue;

        corridorMatchingResults.push({
          ride,
          driver,
          vehicle,
          route,
          waypoints,
          nearestPickupDistanceMeters: corridorResult.nearestPickupDistanceMeters,
          nearestDropDistanceMeters: corridorResult.nearestDropDistanceMeters,
        });
      }
    }

    // 5. Time window filter on corridor matches
    let timeWindowMatchingResults = corridorMatchingResults;
    if (windowStartUtc || windowEndUtc) {
      timeWindowMatchingResults = corridorMatchingResults.filter((r) => {
        const depMs = new Date(r.ride.departure_time).getTime();
        if (windowStartUtc && depMs < new Date(windowStartUtc).getTime()) return false;
        if (windowEndUtc && depMs > new Date(windowEndUtc).getTime()) return false;
        return true;
      });
    }

    const diagnostics: SearchDiagnostics = {
      organization_id: orgId,
      date,
      time_zone: timeZone,
      total_scheduled_rides_in_org: orgScheduledRides.length,
      rides_matching_date: dateMatchingRides.length,
      rides_matching_seats: seatMatchingRides.length,
      rides_matching_corridor: corridorMatchingResults.length,
      rides_matching_time_window: timeWindowMatchingResults.length,
      rides_returned: timeWindowMatchingResults.length,
    };
    (timeWindowMatchingResults as any).diagnostics = diagnostics;

    return timeWindowMatchingResults;
  }

  // --------------------------------------------------------------------------
  // Transactional Actions (State Machine Integrations)
  // --------------------------------------------------------------------------

  public async acceptRideRequestWithPessimisticLock(
    requestId: UUID,
    actorId: UUID
  ): Promise<{ request: RideRequest; ride: Ride }> {
    const request = this.rideRequests.get(requestId);
    if (!request) throw new Error('Ride request not found.');

    const release = await this.acquireLock(`ride:${request.ride_id}`);
    try {
      const ride = this.rides.get(request.ride_id);
      if (!ride) throw new Error('Associated ride not found.');
      if (ride.driver_id !== actorId) throw new Error('Unauthorized: Only the ride host can approve requests.');
      if (ride.available_seats < request.requested_seats) {
        throw new Error(`Insufficient seats: requested ${request.requested_seats}, but only ${ride.available_seats} remain.`);
      }

      const { updatedRequest, updatedRide } = RideRequestStateMachine.accept(request, ride);
      if (updatedRide.available_seats < 0) throw new Error('Check constraint violation: available_seats cannot be negative.');

      this.rides.set(updatedRide.id, updatedRide);
      this.rideRequests.set(updatedRequest.id, updatedRequest);

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

      return { request: updatedRequest, ride: updatedRide };
    } finally {
      release();
    }
  }

  public async rejectRideRequest(requestId: UUID, actorId: UUID, reason?: string): Promise<{ request: RideRequest; ride: Ride }> {
    const rawReq = this.rideRequests.get(requestId);
    if (!rawReq) throw new Error('Ride request not found.');

    const release = await this.acquireLock(`ride:${rawReq.ride_id}`);
    try {
      const request = this.rideRequests.get(requestId);
      if (!request) throw new Error('Ride request not found.');

      const ride = this.rides.get(request.ride_id);
      if (!ride) throw new Error('Associated ride not found.');

      if (ride.driver_id !== actorId) {
        throw new Error('Unauthorized: Only the ride host can reject requests.');
      }

      const updatedRequest = RideRequestStateMachine.reject(request, reason);
      this.rideRequests.set(updatedRequest.id, updatedRequest);

      void this.logAudit(
        ride.organization_id, actorId, 'RIDE_REQUEST', request.id, 'STATE_TRANSITION',
        request.status, updatedRequest.status, { rejection_reason: reason }
      );

      void this.dispatchNotification(
        ride.organization_id, request.passenger_id, 'REQUEST_REJECTED',
        'Ride Request Declined',
        reason ? `Host declined: ${reason}` : 'Host declined this request due to route detour.',
        { ride_id: ride.id, request_id: request.id }
      );

      return { request: updatedRequest, ride };
    } finally {
      release();
    }
  }

  public async cancelRideRequest(requestId: UUID, actorId: UUID, reason?: string): Promise<{ request: RideRequest; ride: Ride }> {
    const rawReq = this.rideRequests.get(requestId);
    if (!rawReq) throw new Error('Ride request not found.');

    const release = await this.acquireLock(`ride:${rawReq.ride_id}`);
    try {
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
        for (const [key, p] of this.ridePassengers.entries()) {
          if (p.ride_request_id === request.id) {
            this.ridePassengers.delete(key);
          }
        }
      }

      void this.logAudit(
        ride.organization_id, actorId, 'RIDE_REQUEST', request.id, 'CANCEL',
        request.status, updatedRequest.status,
        { cancellation_reason: reason, seats_restored: wasAccepted ? request.requested_seats : 0 }
      );

      const recipientId = actorId === request.passenger_id ? ride.driver_id : request.passenger_id;
      void this.dispatchNotification(
        ride.organization_id, recipientId, 'REQUEST_CANCELLED',
        'Carpool Booking Cancelled',
        reason ? `Booking cancelled: ${reason}` : 'A carpool seat booking was cancelled.',
        { ride_id: ride.id, request_id: request.id }
      );

      return { request: updatedRequest, ride: updatedRide };
    } finally {
      release();
    }
  }

  public async startRide(rideId: UUID, actorId: UUID): Promise<Ride> {
    const release = await this.acquireLock(`ride:${rideId}`);
    try {
      const ride = this.rides.get(rideId);
      if (!ride) throw new Error('Ride not found.');
      if (ride.driver_id !== actorId) throw new Error('Unauthorized.');

      const updatedRide = RideStateMachine.startRide(ride);
      this.rides.set(updatedRide.id, updatedRide);

      void this.logAudit(
        ride.organization_id, actorId, 'RIDE', ride.id, 'STATE_TRANSITION',
        ride.status, updatedRide.status
      );

      const acceptedRequests = Array.from(this.rideRequests.values()).filter(
        (r) => r.ride_id === rideId && r.status === 'ACCEPTED'
      );

      for (const req of acceptedRequests) {
        void this.dispatchNotification(
          ride.organization_id, req.passenger_id, 'RIDE_STARTED',
          'Your Ride Has Started!',
          'Your driver has departed. Please be ready at your designated pickup point.',
          { ride_id: ride.id }
        );
      }

      return updatedRide;
    } finally {
      release();
    }
  }

  public async completeRide(rideId: UUID, actorId: UUID): Promise<Ride> {
    const release = await this.acquireLock(`ride:${rideId}`);
    try {
      const ride = this.rides.get(rideId);
      if (!ride) throw new Error('Ride not found.');
      if (ride.driver_id !== actorId) throw new Error('Unauthorized.');

      const updatedRide = RideStateMachine.completeRide(ride);
      this.rides.set(updatedRide.id, updatedRide);

      for (const req of this.rideRequests.values()) {
        if (req.ride_id === rideId && req.status === 'ACCEPTED') {
          const completedReq = RideRequestStateMachine.complete(req);
          this.rideRequests.set(completedReq.id, completedReq);
        }
      }

      void this.logAudit(
        ride.organization_id, actorId, 'RIDE', ride.id, 'STATE_TRANSITION',
        ride.status, updatedRide.status
      );

      return updatedRide;
    } finally {
      release();
    }
  }

  public async cancelRide(rideId: UUID, actorId: UUID, reason: string): Promise<Ride> {
    const release = await this.acquireLock(`ride:${rideId}`);
    try {
      const ride = this.rides.get(rideId);
      if (!ride) throw new Error('Ride not found.');
      if (ride.driver_id !== actorId) throw new Error('Unauthorized.');

      const updatedRide = RideStateMachine.cancelRide(ride, reason);
      this.rides.set(updatedRide.id, updatedRide);

      for (const req of this.rideRequests.values()) {
        if (req.ride_id === rideId && (req.status === 'PENDING' || req.status === 'ACCEPTED')) {
          const { updatedRequest } = RideRequestStateMachine.cancel(req, ride, `Driver cancelled trip: ${reason}`);
          this.rideRequests.set(updatedRequest.id, updatedRequest);

          void this.dispatchNotification(
            ride.organization_id, req.passenger_id, 'RIDE_CANCELLED',
            'Ride Cancelled by Host',
            `The ride scheduled for ${new Date(ride.departure_time).toLocaleTimeString()} was cancelled: ${reason}`,
            { ride_id: ride.id }
          );
        }
      }

      void this.logAudit(
        ride.organization_id, actorId, 'RIDE', ride.id, 'CANCEL',
        ride.status, updatedRide.status, { cancelled_reason: reason }
      );

      return updatedRide;
    } finally {
      release();
    }
  }

  public async activateUserWithPessimisticLock(
    token: string,
    passwordHash: string
  ): Promise<{ user: User; capabilities: UserCapability; notifiedAdminCount: number }> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const release = await this.acquireLock(`activation:${tokenHash}`);

    try {
      const users = await this.getAllUsers();
      const user = users.find((u) => u.invitation_token === tokenHash);
      if (!user) {
        throw new ActivationError(404, 'ERR_INVALID_TOKEN', 'Invitation token not found or already used.');
      }

      if (user.status !== 'PENDING_VERIFICATION') {
        throw new ActivationError(409, 'ERR_INVALID_STATUS', 'User account is not pending verification.');
      }

      const now = new Date();
      if (user.invitation_token_expires_at && new Date(user.invitation_token_expires_at) <= now) {
        throw new ActivationError(410, 'ERR_TOKEN_EXPIRED', 'Invitation token has expired. Please ask your administrator to send a new invitation.');
      }

      const updatedUser: User = {
        ...user,
        password_hash: passwordHash,
        status: 'ACTIVE',
        invitation_token: undefined,
        invitation_token_expires_at: undefined,
        updated_at: now.toISOString(),
      };
      await this.setUser(updatedUser);

      let userCap = await this.getUserCapability(user.id);
      if (!userCap) {
        userCap = {
          id: crypto.randomUUID(),
          user_id: user.id,
          organization_id: user.organization_id,
          can_ride: true,
          can_drive: false,
          is_org_admin: false,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        };
        await this.setUserCapability(userCap);
      }

      // Notify all active org admins (excluding newly activated user unless already admin)
      let notifiedAdminCount = 0;
      for (const [_, cap] of this.userCapabilities.entries()) {
        if (cap.organization_id === user.organization_id && cap.is_org_admin) {
          if (cap.user_id === user.id && !userCap.is_org_admin) continue;
          const admin = await this.getUser(cap.user_id);
          if (admin && admin.status === 'ACTIVE') {
            // Check for existing notification to avoid duplicates
            const existingNotifs = Array.from(this.notifications.values()).filter(
              (n) =>
                n.organization_id === user.organization_id &&
                n.user_id === admin.id &&
                n.type === 'USER_JOINED' &&
                (n.payload_json as any)?.user_id === user.id
            );
            if (existingNotifs.length > 0) continue;

            await this.dispatchNotification(
              user.organization_id,
              admin.id,
              'USER_JOINED',
              'New employee joined',
              `${user.full_name} (${user.email}) has joined the platform.`,
              {
                user_id: user.id,
                organization_id: user.organization_id,
                department: user.work_department || 'General',
              }
            );
            notifiedAdminCount++;
          }
        }
      }

      await this.logAudit(
        user.organization_id,
        user.id,
        'USER',
        user.id,
        'STATE_TRANSITION',
        'PENDING_VERIFICATION',
        'ACTIVE',
        {
          activation_method: 'invitation_token',
          admins_notified: notifiedAdminCount,
        }
      );

      return { user: updatedUser, capabilities: userCap, notifiedAdminCount };
    } finally {
      release();
    }
  }

  public async createRideWithRoute(
    ride: Ride,
    route: RideRoute,
    waypoints: RouteWaypoint[],
    auditMetadata?: Record<string, unknown>
  ): Promise<{ ride: Ride; route: RideRoute; waypoints: RouteWaypoint[] }> {
    const release = await this.acquireLock(`ride:${ride.id}`);
    try {
      this.rides.set(ride.id, ride);
      this.rideRoutes.set(route.id, route);
      for (const wp of waypoints) {
        this.routeWaypoints.set(wp.id, wp);
      }
      this.auditLogs.push({
        id: crypto.randomUUID(),
        organization_id: ride.organization_id,
        actor_user_id: ride.driver_id,
        entity_type: 'RIDE',
        entity_id: ride.id,
        action: 'CREATE',
        from_state: 'DRAFT',
        to_state: ride.status,
        metadata_json: auditMetadata || {},
        created_at: new Date().toISOString(),
      });
      return { ride, route, waypoints };
    } finally {
      release();
    }
  }

  public async expirePendingRequest(requestId: UUID): Promise<boolean> {
    const release = await this.acquireLock(`request:${requestId}`);
    try {
      const request = this.rideRequests.get(requestId);
      if (!request || request.status !== 'PENDING') return false;

      const ride = this.rides.get(request.ride_id);
      if (!ride) return false;

      const departureMs = new Date(ride.departure_time).getTime();
      if (departureMs >= Date.now()) return false;

      const updatedRequest = RideRequestStateMachine.expire(request);
      this.rideRequests.set(updatedRequest.id, updatedRequest);

      this.auditLogs.push({
        id: crypto.randomUUID(),
        organization_id: ride.organization_id,
        entity_type: 'RIDE_REQUEST',
        entity_id: request.id,
        action: 'STATE_TRANSITION',
        from_state: 'PENDING',
        to_state: 'EXPIRED',
        metadata_json: { reason: 'Auto-expired: Trip departure time passed without driver approval' },
        created_at: new Date().toISOString(),
      });

      void this.dispatchNotification(
        ride.organization_id,
        request.passenger_id,
        'SYSTEM_ANNOUNCEMENT',
        'Seat Request Expired',
        'Your seat request has expired because the trip departed without being confirmed.',
        { ride_id: ride.id, request_id: request.id }
      );

      return true;
    } finally {
      release();
    }
  }

  public async autoCancelRide(rideId: UUID, reason: string): Promise<boolean> {
    const release = await this.acquireLock(`ride:${rideId}`);
    try {
      const ride = this.rides.get(rideId);
      if (!ride || ride.status !== 'SCHEDULED') return false;

      const updatedRide = RideStateMachine.cancelRide(ride, reason);
      this.rides.set(updatedRide.id, updatedRide);

      const cancelledRequests: RideRequest[] = [];
      for (const req of this.rideRequests.values()) {
        if (req.ride_id === rideId && (req.status === 'PENDING' || req.status === 'ACCEPTED')) {
          const { updatedRequest } = RideRequestStateMachine.cancel(req, ride, reason);
          this.rideRequests.set(updatedRequest.id, updatedRequest);

          if (req.status === 'ACCEPTED') {
            for (const [pId, p] of this.ridePassengers.entries()) {
              if (p.ride_request_id === req.id) {
                this.ridePassengers.delete(pId);
              }
            }
          }
          cancelledRequests.push(updatedRequest);
        }
      }

      this.auditLogs.push({
        id: crypto.randomUUID(),
        organization_id: ride.organization_id,
        entity_type: 'RIDE',
        entity_id: ride.id,
        action: 'CANCEL',
        from_state: 'SCHEDULED',
        to_state: 'CANCELLED',
        metadata_json: { reason },
        created_at: new Date().toISOString(),
      });

      for (const req of cancelledRequests) {
        void this.dispatchNotification(
          ride.organization_id,
          req.passenger_id,
          'RIDE_CANCELLED',
          'Carpool Cancelled by System',
          'The carpool was automatically cancelled because the driver did not start the trip.',
          { ride_id: ride.id }
        );
      }

      void this.dispatchNotification(
        ride.organization_id,
        ride.driver_id,
        'RIDE_CANCELLED',
        'Trip Auto-Cancelled',
        'Your scheduled carpool was marked cancelled because it was not started within 30 minutes of departure.',
        { ride_id: ride.id }
      );

      return true;
    } finally {
      release();
    }
  }

  private distributedLocks: Set<number> = new Set();
  public async acquireDistributedLock(lockId: number = 88291034): Promise<boolean> {
    if (this.distributedLocks.has(lockId)) return false;
    this.distributedLocks.add(lockId);
    return true;
  }

  public async releaseDistributedLock(lockId: number = 88291034): Promise<boolean> {
    this.distributedLocks.delete(lockId);
    return true;
  }

  public async inviteUser(
    user: User,
    capability: UserCapability,
    auditMetadata?: Record<string, unknown>
  ): Promise<{ user: User; capability: UserCapability }> {
    const release = await this.acquireLock(`user:${user.email.toLowerCase().trim()}`);
    try {
      this.users.set(user.id, user);
      this.userCapabilities.set(capability.user_id, capability);
      this.auditLogs.push({
        id: crypto.randomUUID(),
        organization_id: user.organization_id,
        entity_type: 'USER',
        entity_id: user.id,
        action: 'CREATE',
        to_state: 'PENDING_VERIFICATION',
        metadata_json: auditMetadata || {},
        created_at: new Date().toISOString(),
      });
      return { user, capability };
    } finally {
      release();
    }
  }

  public async getRidesByOrganization(orgId: UUID): Promise<Ride[]> {
    return Array.from(this.rides.values()).filter((r) => r.organization_id === orgId);
  }

  public async getRideRequestsByOrganization(orgId: UUID): Promise<RideRequest[]> {
    return Array.from(this.rideRequests.values()).filter((r) => r.organization_id === orgId);
  }

  public async getUsersByOrganization(orgId: UUID): Promise<User[]> {
    return Array.from(this.users.values()).filter((u) => u.organization_id === orgId);
  }

  public async getVehiclesByOrganization(orgId: UUID): Promise<Vehicle[]> {
    return Array.from(this.vehicles.values()).filter((v) => v.organization_id === orgId);
  }

  public async getOrganizationRideMetrics(orgId: UUID): Promise<{
    totalRides: number;
    scheduledRides: number;
    completedRides: number;
    cancelledRides: number;
    totalSeatsOffered: number;
    availableSeats: number;
    totalRequests: number;
    acceptedRequests: number;
  }> {
    const rides = Array.from(this.rides.values()).filter((r) => r.organization_id === orgId);
    const requests = Array.from(this.rideRequests.values()).filter((r) => r.organization_id === orgId);

    let totalSeatsOffered = 0;
    let availableSeats = 0;
    for (const r of rides) {
      totalSeatsOffered += Number(r.total_seats_offered) || 0;
      availableSeats += Number(r.available_seats) || 0;
    }

    return {
      totalRides: rides.length,
      scheduledRides: rides.filter((r) => r.status === 'SCHEDULED').length,
      completedRides: rides.filter((r) => r.status === 'COMPLETED').length,
      cancelledRides: rides.filter((r) => r.status === 'CANCELLED').length,
      totalSeatsOffered,
      availableSeats,
      totalRequests: requests.length,
      acceptedRequests: requests.filter((r) => r.status === 'ACCEPTED').length,
    };
  }
}
