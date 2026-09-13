/**
 * IDataRepository: Common async interface implemented by both
 * - PostgresStore (production: real Drizzle/PostgreSQL)
 * - DataStore (test/dev: in-memory Maps)
 *
 * All production code that needs data access must depend on this interface,
 * not on a concrete implementation class.
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

export interface CorridorSearchResult {
  ride: Ride;
  driver: User;
  vehicle: Vehicle;
  route: RideRoute;
  waypoints: RouteWaypoint[];
  nearestPickupDistanceMeters: number;
  nearestDropDistanceMeters: number;
}

export interface IDataRepository {
  // Organizations
  getOrganization(id: UUID): Promise<Organization | undefined>;
  getAllOrganizations(): Promise<Organization[]>;
  setOrganization(item: Organization): Promise<void>;

  // Users
  getUser(id: UUID): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  setUser(item: User): Promise<void>;

  // User Capabilities
  getUserCapability(userId: UUID): Promise<UserCapability | undefined>;
  setUserCapability(item: UserCapability): Promise<void>;

  // User Locations
  getAllUserLocations(): Promise<UserLocation[]>;
  setUserLocation(item: UserLocation): Promise<void>;

  // Vehicles
  getVehicle(id: UUID): Promise<Vehicle | undefined>;
  getAllVehicles(): Promise<Vehicle[]>;
  setVehicle(item: Vehicle): Promise<void>;

  // Rides
  getRide(id: UUID): Promise<Ride | undefined>;
  getAllRides(): Promise<Ride[]>;
  setRide(item: Ride): Promise<void>;

  // Ride Routes
  getRideRoute(id: UUID): Promise<RideRoute | undefined>;
  getAllRideRoutes(): Promise<RideRoute[]>;
  setRideRoute(item: RideRoute): Promise<void>;

  // Route Waypoints
  getAllRouteWaypoints(): Promise<RouteWaypoint[]>;
  setRouteWaypoint(item: RouteWaypoint): Promise<void>;

  // Pickup/Drop Points
  getPickupPoint(id: UUID): Promise<PickupPoint | undefined>;
  getAllPickupPoints(): Promise<PickupPoint[]>;
  setPickupPoint(item: PickupPoint): Promise<void>;

  getDropPoint(id: UUID): Promise<DropPoint | undefined>;
  getAllDropPoints(): Promise<DropPoint[]>;
  setDropPoint(item: DropPoint): Promise<void>;

  // Ride Requests
  getRideRequest(id: UUID): Promise<RideRequest | undefined>;
  getAllRideRequests(): Promise<RideRequest[]>;
  setRideRequest(item: RideRequest): Promise<void>;

  // Ride Passengers
  getAllRidePassengers(): Promise<RidePassenger[]>;
  setRidePassenger(item: RidePassenger): Promise<void>;
  deleteRidePassengerByRequestId(requestId: UUID): Promise<void>;

  // Notifications
  getNotification(id: UUID): Promise<Notification | undefined>;
  getAllNotifications(): Promise<Notification[]>;
  setNotification(item: Notification): Promise<void>;

  // Audit Logs
  getAllAuditLogs(): Promise<AuditLog[]>;
  appendAuditLog(item: AuditLog): Promise<void>;

  // High-level helpers
  logAudit(
    orgId: UUID,
    actorId: UUID | undefined,
    entityType: string,
    entityId: UUID,
    action: AuditLog['action'],
    fromState?: string,
    toState?: string,
    metadata?: Record<string, unknown>
  ): Promise<void>;

  dispatchNotification(
    orgId: UUID,
    userId: UUID,
    type: Notification['type'],
    title: string,
    body: string,
    payload?: Record<string, unknown>,
    channel?: Notification['channel']
  ): Promise<void>;

  searchCorridorRides(params: {
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
  }): Promise<CorridorSearchResult[]>;

  acceptRideRequestWithPessimisticLock(
    requestId: UUID,
    actorId: UUID
  ): Promise<{ request: RideRequest; ride: Ride }>;

  cancelRideRequestWithPessimisticLock(
    requestId: UUID,
    actorId: UUID,
    reason?: string
  ): Promise<{ request: RideRequest; ride: Ride }>;
  cancelRideRequest(
    requestId: UUID,
    actorId: UUID,
    reason?: string
  ): Promise<{ request: RideRequest; ride: Ride }>;

  rejectRideRequestWithPessimisticLock(
    requestId: UUID,
    actorId: UUID,
    reason?: string
  ): Promise<{ request: RideRequest; ride: Ride }>;
  rejectRideRequest(
    requestId: UUID,
    actorId: UUID,
    reason?: string
  ): Promise<{ request: RideRequest; ride: Ride }>;

  startRideWithPessimisticLock(
    rideId: UUID,
    actorId: UUID
  ): Promise<Ride>;
  startRide(
    rideId: UUID,
    actorId: UUID
  ): Promise<Ride>;

  completeRideWithPessimisticLock(
    rideId: UUID,
    actorId: UUID
  ): Promise<Ride>;
  completeRide(
    rideId: UUID,
    actorId: UUID
  ): Promise<Ride>;

  cancelRideWithPessimisticLock(
    rideId: UUID,
    actorId: UUID,
    reason: string
  ): Promise<Ride>;
  cancelRide(
    rideId: UUID,
    actorId: UUID,
    reason: string
  ): Promise<Ride>;

  activateUserWithPessimisticLock(
    token: string,
    passwordHash: string
  ): Promise<{ user: User; capabilities: UserCapability; notifiedAdminCount: number }>;

  // Atomic ride creation
  createRideWithRoute(
    ride: Ride,
    route: RideRoute,
    waypoints: RouteWaypoint[],
    auditMetadata?: Record<string, unknown>
  ): Promise<{ ride: Ride; route: RideRoute; waypoints: RouteWaypoint[] }>;

  // Worker transactional methods & distributed lock
  expirePendingRequest(requestId: UUID): Promise<boolean>;
  autoCancelRide(rideId: UUID, reason: string): Promise<boolean>;
  acquireDistributedLock(lockId?: number): Promise<boolean>;
  releaseDistributedLock(lockId?: number): Promise<boolean>;

  // Atomic user invitation
  inviteUser(
    user: User,
    capability: UserCapability,
    auditMetadata?: Record<string, unknown>
  ): Promise<{ user: User; capability: UserCapability }>;

  // Org-scoped queries and aggregates
  getRidesByOrganization(orgId: UUID): Promise<Ride[]>;
  getRideRequestsByOrganization(orgId: UUID): Promise<RideRequest[]>;
  getUsersByOrganization(orgId: UUID): Promise<User[]>;
  getVehiclesByOrganization(orgId: UUID): Promise<Vehicle[]>;
  getOrganizationRideMetrics(orgId: UUID): Promise<{
    totalRides: number;
    scheduledRides: number;
    completedRides: number;
    cancelledRides: number;
    totalSeatsOffered: number;
    availableSeats: number;
    totalRequests: number;
    acceptedRequests: number;
  }>;
}

export class ActivationError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ActivationError';
  }
}

export class ConcurrencyConflictError extends Error {
  constructor(message: string = 'The resource was updated concurrently. Please retry.') {
    super(message);
    this.name = 'ConcurrencyConflictError';
  }
}

