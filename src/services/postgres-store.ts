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
} from "../domain/types";
import { getDb, withTransaction } from "../infrastructure/db/client";
import * as schema from "../infrastructure/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { RideStateMachine } from "../domain/state-machines/ride-state-machine";
import { RideRequestStateMachine } from "../domain/state-machines/ride-request-state-machine";
import { calculateHaversineDistanceMeters } from "../domain/geo";
import { isRideOnServiceDate, matchCorridor, SearchDiagnostics } from "../domain/routing/corridor-matcher";
import crypto from "node:crypto";
import { ActivationError, CorridorSearchResult } from "./repository.interface";

const DATE_FIELDS = new Set([
  'created_at',
  'updated_at',
  'verified_at',
  'driver_verified_at',
  'invitation_token_expires_at',
  'departure_time',
  'arrival_time_estimated',
  'cancelled_at',
  'started_at',
  'completed_at',
  'responded_at',
  'read_at',
  'sent_at',
]);

function toSqlDates<T extends Record<string, any>>(item: T): any {
  if (!item) return item;
  const result: any = { ...item };
  for (const key of Object.keys(result)) {
    if (DATE_FIELDS.has(key) && result[key] !== undefined && result[key] !== null) {
      result[key] = typeof result[key] === 'string' ? new Date(result[key]) : result[key];
    }
  }
  return result;
}

function fromSqlDates<T extends Record<string, any>>(item: T): T {
  if (!item) return item;
  const result: any = { ...item };
  for (const key of Object.keys(result)) {
    if (DATE_FIELDS.has(key) && result[key] instanceof Date) {
      result[key] = result[key].toISOString();
    }
  }
  return result;
}

function normalizeUserLocation(row: any): UserLocation {
  const item = fromSqlDates(row);
  return {
    ...item,
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
  };
}

function normalizeVehicle(row: any): Vehicle {
  const item = fromSqlDates(row);
  return {
    ...item,
    year: Number(item.year),
    total_seats: Number(item.total_seats),
    max_passenger_capacity: item.max_passenger_capacity != null ? Number(item.max_passenger_capacity) : undefined,
  };
}

function normalizeRide(row: any): Ride {
  const item = fromSqlDates(row);
  return {
    ...item,
    total_seats_offered: Number(item.total_seats_offered),
    available_seats: Number(item.available_seats),
    cost_per_seat_cents: item.cost_per_seat_cents != null ? Number(item.cost_per_seat_cents) : 0,
    version: item.version != null ? Number(item.version) : 1,
  };
}

function normalizeRideRoute(row: any): RideRoute {
  const item = fromSqlDates(row);
  const bbox = item.bounding_box || {};
  return {
    ...item,
    origin_latitude: Number(item.origin_latitude),
    origin_longitude: Number(item.origin_longitude),
    destination_latitude: Number(item.destination_latitude),
    destination_longitude: Number(item.destination_longitude),
    total_distance_meters: Number(item.total_distance_meters),
    total_duration_seconds: Number(item.total_duration_seconds),
    min_latitude: Number(item.min_latitude),
    max_latitude: Number(item.max_latitude),
    min_longitude: Number(item.min_longitude),
    max_longitude: Number(item.max_longitude),
    bounding_box: {
      min_lat: Number(bbox.min_lat ?? item.min_latitude),
      max_lat: Number(bbox.max_lat ?? item.max_latitude),
      min_lng: Number(bbox.min_lng ?? item.min_longitude),
      max_lng: Number(bbox.max_lng ?? item.max_longitude),
    },
  };
}

function normalizeRouteWaypoint(row: any): RouteWaypoint {
  const item = fromSqlDates(row);
  return {
    ...item,
    stop_order: Number(item.stop_order),
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
    estimated_arrival_offset_seconds: item.estimated_arrival_offset_seconds != null ? Number(item.estimated_arrival_offset_seconds) : 0,
  };
}

function normalizePickupPoint(row: any): PickupPoint {
  const item = fromSqlDates(row);
  return {
    ...item,
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
  };
}

function normalizeDropPoint(row: any): DropPoint {
  const item = fromSqlDates(row);
  return {
    ...item,
    latitude: Number(item.latitude),
    longitude: Number(item.longitude),
  };
}

function normalizeRideRequest(row: any): RideRequest {
  const item = fromSqlDates(row);
  return {
    ...item,
    requested_seats: Number(item.requested_seats),
    version: item.version != null ? Number(item.version) : 1,
  };
}

function normalizeRidePassenger(row: any): RidePassenger {
  const item = fromSqlDates(row);
  return {
    ...item,
    seats_booked: Number(item.seats_booked),
  };
}

export class PostgresStore {
  private static instance: PostgresStore;

  public static getInstance(): PostgresStore {
    if (!PostgresStore.instance) {
      PostgresStore.instance = new PostgresStore();
    }
    return PostgresStore.instance;
  }

  public async getOrganization(id: UUID): Promise<Organization | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.organizations).where(eq(schema.organizations.id, id)).limit(1);
    return res[0] ? fromSqlDates(res[0]) as unknown as Organization : undefined;
  }

  public async getAllOrganizations(): Promise<Organization[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.organizations);
    return res.map((r: any) => fromSqlDates(r) as unknown as Organization);
  }

  public async setOrganization(item: Organization): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.organizations).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.organizations.id,
      set: toSqlDates(item)
    });
  }

  public async getUser(id: UUID): Promise<User | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    return res[0] ? fromSqlDates(res[0]) as unknown as User : undefined;
  }

  public async getAllUsers(): Promise<User[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.users);
    return res.map((r: any) => fromSqlDates(r) as unknown as User);
  }

  public async setUser(item: User): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.users).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.users.id,
      set: toSqlDates(item)
    });
  }

  public async getUserCapability(id: UUID): Promise<UserCapability | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.userCapabilities).where(eq(schema.userCapabilities.user_id, id)).limit(1);
    return res[0] ? fromSqlDates(res[0]) as unknown as UserCapability : undefined;
  }

  public async getAllUserCapabilitys(): Promise<UserCapability[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.userCapabilities);
    return res.map((r: any) => fromSqlDates(r) as unknown as UserCapability);
  }

  public async setUserCapability(item: UserCapability): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.userCapabilities).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.userCapabilities.user_id,
      set: toSqlDates(item)
    });
  }

  public async getUserLocation(id: UUID): Promise<UserLocation | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.userLocations).where(eq(schema.userLocations.id, id)).limit(1);
    return res[0] ? normalizeUserLocation(res[0]) : undefined;
  }

  public async getAllUserLocations(): Promise<UserLocation[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.userLocations);
    return res.map(normalizeUserLocation);
  }

  public async setUserLocation(item: UserLocation): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.userLocations).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.userLocations.id,
      set: toSqlDates(item)
    });
  }

  public async getVehicle(id: UUID): Promise<Vehicle | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.vehicles).where(eq(schema.vehicles.id, id)).limit(1);
    return res[0] ? normalizeVehicle(res[0]) : undefined;
  }

  public async getAllVehicles(): Promise<Vehicle[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.vehicles);
    return res.map(normalizeVehicle);
  }

  public async setVehicle(item: Vehicle): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.vehicles).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.vehicles.id,
      set: toSqlDates(item)
    });
  }

  public async getRide(id: UUID): Promise<Ride | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.rides).where(eq(schema.rides.id, id)).limit(1);
    return res[0] ? normalizeRide(res[0]) : undefined;
  }

  public async getAllRides(): Promise<Ride[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.rides);
    return res.map(normalizeRide);
  }

  public async setRide(item: Ride): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.rides).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.rides.id,
      set: toSqlDates(item)
    });
  }

  public async getRideRoute(id: UUID): Promise<RideRoute | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.rideRoutes).where(eq(schema.rideRoutes.id, id)).limit(1);
    return res[0] ? normalizeRideRoute(res[0]) : undefined;
  }

  public async getAllRideRoutes(): Promise<RideRoute[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.rideRoutes);
    return res.map(normalizeRideRoute);
  }

  public async setRideRoute(item: RideRoute): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.rideRoutes).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.rideRoutes.id,
      set: toSqlDates(item)
    });
  }

  public async getRouteWaypoint(id: UUID): Promise<RouteWaypoint | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.routeWaypoints).where(eq(schema.routeWaypoints.id, id)).limit(1);
    return res[0] ? normalizeRouteWaypoint(res[0]) : undefined;
  }

  public async getAllRouteWaypoints(): Promise<RouteWaypoint[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.routeWaypoints);
    return res.map(normalizeRouteWaypoint);
  }

  public async setRouteWaypoint(item: RouteWaypoint): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.routeWaypoints).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.routeWaypoints.id,
      set: toSqlDates(item)
    });
  }

  public async getPickupPoint(id: UUID): Promise<PickupPoint | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.pickupPoints).where(eq(schema.pickupPoints.id, id)).limit(1);
    return res[0] ? normalizePickupPoint(res[0]) : undefined;
  }

  public async getAllPickupPoints(): Promise<PickupPoint[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.pickupPoints);
    return res.map(normalizePickupPoint);
  }

  public async setPickupPoint(item: PickupPoint): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.pickupPoints).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.pickupPoints.id,
      set: toSqlDates(item)
    });
  }

  public async getDropPoint(id: UUID): Promise<DropPoint | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.dropPoints).where(eq(schema.dropPoints.id, id)).limit(1);
    return res[0] ? normalizeDropPoint(res[0]) : undefined;
  }

  public async getAllDropPoints(): Promise<DropPoint[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.dropPoints);
    return res.map(normalizeDropPoint);
  }

  public async setDropPoint(item: DropPoint): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.dropPoints).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.dropPoints.id,
      set: toSqlDates(item)
    });
  }

  public async getRideRequest(id: UUID): Promise<RideRequest | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.rideRequests).where(eq(schema.rideRequests.id, id)).limit(1);
    return res[0] ? normalizeRideRequest(res[0]) : undefined;
  }

  public async getAllRideRequests(): Promise<RideRequest[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.rideRequests);
    return res.map(normalizeRideRequest);
  }

  public async setRideRequest(item: RideRequest): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.rideRequests).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.rideRequests.id,
      set: toSqlDates(item)
    });
  }

  public async getRidePassenger(id: UUID): Promise<RidePassenger | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.ridePassengers).where(eq(schema.ridePassengers.id, id)).limit(1);
    return res[0] ? normalizeRidePassenger(res[0]) : undefined;
  }

  public async deleteRidePassengerByRequestId(requestId: UUID): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.delete(schema.ridePassengers).where(eq(schema.ridePassengers.ride_request_id, requestId));
  }

  public async getAllRidePassengers(): Promise<RidePassenger[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.ridePassengers);
    return res.map(normalizeRidePassenger);
  }

  public async setRidePassenger(item: RidePassenger): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.ridePassengers).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.ridePassengers.id,
      set: toSqlDates(item)
    });
  }

  public async getNotification(id: UUID): Promise<Notification | undefined> {
    const db = getDb();
    if (!db) return undefined;
    const res = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id)).limit(1);
    return res[0] as unknown as Notification;
  }

  public async getAllNotifications(): Promise<Notification[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.notifications);
    return res as unknown as Notification[];
  }

  public async setNotification(item: Notification): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.notifications).values(toSqlDates(item)).onConflictDoUpdate({
      target: schema.notifications.id,
      set: toSqlDates(item)
    });
  }

  public async getAllAuditLogs(): Promise<AuditLog[]> {
    const db = getDb();
    if (!db) return [];
    const res = await db.select().from(schema.auditLogs).orderBy(schema.auditLogs.created_at);
    return res as unknown as AuditLog[];
  }

  public async appendAuditLog(log: AuditLog): Promise<void> {
    const db = getDb();
    if (!db) return;
    await db.insert(schema.auditLogs).values(toSqlDates(log));
  }

  public async logAudit(
    orgId: UUID,
    actorId: UUID | undefined,
    entityType: string,
    entityId: UUID,
    action: AuditLog["action"],
    fromState?: string,
    toState?: string,
    metadata: Record<string, unknown> = {}
  ): Promise<void> {
    const log: AuditLog = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      actor_user_id: actorId || null as any,
      entity_type: entityType,
      entity_id: entityId,
      action,
      from_state: fromState || null as any,
      to_state: toState || null as any,
      metadata_json: metadata,
      ip_address: "127.0.0.1",
      user_agent: "CorporateWeb/1.0",
      created_at: new Date().toISOString(),
    };
    await this.appendAuditLog(log);
  }

  public async dispatchNotification(
    orgId: UUID,
    userId: UUID,
    type: Notification["type"],
    title: string,
    body: string,
    payload: Record<string, unknown> = {}
  ): Promise<void> {
    const notification: Notification = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      user_id: userId,
      type,
      channel: "IN_APP",
      title,
      body,
      payload_json: payload,
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      read_at: null as any,
    };
    await this.setNotification(notification);
  }

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

    const allRides = await this.getAllRides();
    // 1. Organization & SCHEDULED filter
    const orgScheduledRides = allRides.filter(
      (r) => r.organization_id === orgId && r.status === "SCHEDULED"
    );

    // 2. Service date filter: UTC start to UTC next-day start
    const dateMatchingRides = orgScheduledRides.filter((r) =>
      isRideOnServiceDate(r.departure_time, date, timeZone, dateStartUtc, dateEndUtc)
    );

    // 3. Seat availability filter
    const seatMatchingRides = dateMatchingRides.filter(
      (r) => r.available_seats >= seatsNeeded
    );

    const allRoutes = await this.getAllRideRoutes();
    const allWaypoints = await this.getAllRouteWaypoints();
    const allUsers = await this.getAllUsers();
    const allVehicles = await this.getAllVehicles();

    // 4. Corridor matching (both pickup AND drop must be within maxDetourMeters)
    const corridorMatchingResults: CorridorSearchResult[] = [];
    for (const ride of seatMatchingRides) {
      const route = allRoutes.find((rr) => rr.ride_id === ride.id);
      if (!route) continue;

      const waypoints = allWaypoints
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
        const driver = allUsers.find((u) => u.id === ride.driver_id);
        const vehicle = allVehicles.find((v) => v.id === ride.vehicle_id);
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

  public async acceptRideRequestWithPessimisticLock(
    requestId: UUID,
    actorId: UUID
  ): Promise<{ request: RideRequest; ride: Ride }> {
    const db = getDb();
    if (!db) throw new Error("Database not initialized");

    const result = await withTransaction(async (tx) => {
      // 1. Lock the ride request first
      const reqRows = await tx
        .select()
        .from(schema.rideRequests)
        .where(eq(schema.rideRequests.id, requestId))
        .for('update');
      
      const request = normalizeRideRequest(reqRows[0]);
      if (!request) throw new Error("Ride request not found.");

      // 2. Lock the associated ride
      const rideRows = await tx
        .select()
        .from(schema.rides)
        .where(eq(schema.rides.id, request.ride_id))
        .for('update');
        
      const ride = normalizeRide(rideRows[0]);
      if (!ride) throw new Error("Associated ride not found.");

      // 3. Domain validation
      if (ride.driver_id !== actorId) {
        throw new Error("Unauthorized: Only the ride host can approve requests.");
      }

      // 4. State machine transition
      const { updatedRequest, updatedRide } = RideRequestStateMachine.accept(request, ride);

      // 5. Update DB inside transaction
      await tx
        .update(schema.rides)
        .set(toSqlDates(updatedRide) as any)
        .where(eq(schema.rides.id, ride.id));
        
      await tx
        .update(schema.rideRequests)
        .set(toSqlDates(updatedRequest) as any)
        .where(eq(schema.rideRequests.id, request.id));

      const passengerEntry: RidePassenger = {
        id: crypto.randomUUID(),
        organization_id: ride.organization_id,
        ride_id: ride.id,
        ride_request_id: request.id,
        passenger_id: request.passenger_id,
        seats_booked: request.requested_seats,
        created_at: new Date().toISOString(),
      };
      
      await tx
        .insert(schema.ridePassengers)
        .values(toSqlDates(passengerEntry) as any);

      return { request: updatedRequest, ride: updatedRide };
    });

    await this.logAudit(
      result.ride.organization_id,
      actorId,
      "RIDE_REQUEST",
      result.request.id,
      "STATE_TRANSITION",
      "PENDING",
      result.request.status,
      { seats_booked: result.request.requested_seats, remaining_seats: result.ride.available_seats }
    );

    await this.dispatchNotification(
      result.ride.organization_id,
      result.request.passenger_id,
      "REQUEST_ACCEPTED",
      "Ride Request Confirmed!",
      "Your host has confirmed your seat for the commute on " + new Date(result.ride.departure_time).toLocaleDateString() + ".",
      { ride_id: result.ride.id, request_id: result.request.id }
    );

    return result;
  }

  public async acceptRideRequest(requestId: UUID, actorId: UUID): Promise<{ request: RideRequest; ride: Ride }> {
    const request = await this.getRideRequest(requestId);
    if (!request) throw new Error("Ride request not found.");

    const ride = await this.getRide(request.ride_id);
    if (!ride) throw new Error("Associated ride not found.");

    if (ride.driver_id !== actorId) {
      throw new Error("Unauthorized: Only the ride host can approve requests.");
    }

    const { updatedRequest, updatedRide } = RideRequestStateMachine.accept(request, ride);

    await this.setRide(updatedRide);
    await this.setRideRequest(updatedRequest);

    const passengerEntry: RidePassenger = {
      id: crypto.randomUUID(),
      organization_id: ride.organization_id,
      ride_id: ride.id,
      ride_request_id: request.id,
      passenger_id: request.passenger_id,
      seats_booked: request.requested_seats,
      created_at: new Date().toISOString(),
    };
    await this.setRidePassenger(passengerEntry);

    await this.logAudit(
      ride.organization_id,
      actorId,
      "RIDE_REQUEST",
      request.id,
      "STATE_TRANSITION",
      request.status,
      updatedRequest.status,
      { seats_booked: request.requested_seats, remaining_seats: updatedRide.available_seats }
    );

    await this.dispatchNotification(
      ride.organization_id,
      request.passenger_id,
      "REQUEST_ACCEPTED",
      "Ride Request Confirmed!",
      "Your host has confirmed your seat for the commute on " + new Date(ride.departure_time).toLocaleDateString() + ".",
      { ride_id: ride.id, request_id: request.id }
    );

    return { request: updatedRequest, ride: updatedRide };
  }

  public async rejectRideRequest(requestId: UUID, actorId: UUID, reason?: string): Promise<{ request: RideRequest; ride: Ride }> {
    const request = await this.getRideRequest(requestId);
    if (!request) throw new Error("Ride request not found.");

    const ride = await this.getRide(request.ride_id);
    if (!ride) throw new Error("Associated ride not found.");

    if (ride.driver_id !== actorId) {
      throw new Error("Unauthorized: Only the ride host can reject requests.");
    }

    const updatedRequest = RideRequestStateMachine.reject(request, reason);
    await this.setRideRequest(updatedRequest);

    await this.logAudit(
      ride.organization_id,
      actorId,
      "RIDE_REQUEST",
      request.id,
      "STATE_TRANSITION",
      request.status,
      updatedRequest.status,
      { rejection_reason: reason }
    );

    await this.dispatchNotification(
      ride.organization_id,
      request.passenger_id,
      "REQUEST_REJECTED",
      "Ride Request Declined",
      reason ? "Host declined: " + reason : "Host declined this request due to route detour.",
      { ride_id: ride.id, request_id: request.id }
    );

    return { request: updatedRequest, ride };
  }

  public async cancelRideRequest(requestId: UUID, actorId: UUID, reason?: string): Promise<{ request: RideRequest; ride: Ride }> {
    const request = await this.getRideRequest(requestId);
    if (!request) throw new Error("Ride request not found.");

    const ride = await this.getRide(request.ride_id);
    if (!ride) throw new Error("Associated ride not found.");

    if (request.passenger_id !== actorId && ride.driver_id !== actorId) {
      throw new Error("Unauthorized: Only the passenger or driver can cancel this request.");
    }

    const wasAccepted = request.status === "ACCEPTED";
    const { updatedRequest, updatedRide } = RideRequestStateMachine.cancel(request, ride, reason);

    await this.setRide(updatedRide);
    await this.setRideRequest(updatedRequest);

    if (wasAccepted) {
        const db = getDb();
        if (db) {
            await db.delete(schema.ridePassengers).where(eq(schema.ridePassengers.ride_request_id, request.id));
        }
    }

    await this.logAudit(
      ride.organization_id,
      actorId,
      "RIDE_REQUEST",
      request.id,
      "CANCEL",
      request.status,
      updatedRequest.status,
      { cancellation_reason: reason, seats_restored: wasAccepted ? request.requested_seats : 0 }
    );

    const recipientId = actorId === request.passenger_id ? ride.driver_id : request.passenger_id;
    await this.dispatchNotification(
      ride.organization_id,
      recipientId,
      "REQUEST_CANCELLED",
      "Carpool Booking Cancelled",
      reason ? "Booking cancelled: " + reason : "A carpool seat booking was cancelled.",
      { ride_id: ride.id, request_id: request.id }
    );

    return { request: updatedRequest, ride: updatedRide };
  }

  public async startRide(rideId: UUID, actorId: UUID): Promise<Ride> {
    const ride = await this.getRide(rideId);
    if (!ride) throw new Error("Ride not found.");
    if (ride.driver_id !== actorId) throw new Error("Unauthorized.");

    const updatedRide = RideStateMachine.startRide(ride);
    await this.setRide(updatedRide);

    await this.logAudit(
      ride.organization_id,
      actorId,
      "RIDE",
      ride.id,
      "STATE_TRANSITION",
      ride.status,
      updatedRide.status
    );

    const allRequests = await this.getAllRideRequests();
    const acceptedRequests = allRequests.filter(
      (r) => r.ride_id === rideId && r.status === "ACCEPTED"
    );

    for (const req of acceptedRequests) {
      await this.dispatchNotification(
        ride.organization_id,
        req.passenger_id,
        "RIDE_STARTED",
        "Your Ride Has Started!",
        "Your driver has departed. Please be ready at your designated pickup point.",
        { ride_id: ride.id }
      );
    }

    return updatedRide;
  }

  public async completeRide(rideId: UUID, actorId: UUID): Promise<Ride> {
    const ride = await this.getRide(rideId);
    if (!ride) throw new Error("Ride not found.");
    if (ride.driver_id !== actorId) throw new Error("Unauthorized.");

    const updatedRide = RideStateMachine.completeRide(ride);
    await this.setRide(updatedRide);

    const allRequests = await this.getAllRideRequests();
    for (const req of allRequests) {
      if (req.ride_id === rideId && req.status === "ACCEPTED") {
        const completedReq = RideRequestStateMachine.complete(req);
        await this.setRideRequest(completedReq);
      }
    }

    await this.logAudit(
      ride.organization_id,
      actorId,
      "RIDE",
      ride.id,
      "STATE_TRANSITION",
      ride.status,
      updatedRide.status
    );

    return updatedRide;
  }

  public async cancelRide(rideId: UUID, actorId: UUID, reason: string): Promise<Ride> {
    const ride = await this.getRide(rideId);
    if (!ride) throw new Error("Ride not found.");
    if (ride.driver_id !== actorId) throw new Error("Unauthorized.");

    const updatedRide = RideStateMachine.cancelRide(ride, reason);
    await this.setRide(updatedRide);

    const allRequests = await this.getAllRideRequests();
    for (const req of allRequests) {
      if (req.ride_id === rideId && (req.status === "PENDING" || req.status === "ACCEPTED")) {
        const { updatedRequest } = RideRequestStateMachine.cancel(
          req,
          ride,
          "Driver cancelled trip: " + reason
        );
        await this.setRideRequest(updatedRequest);

        await this.dispatchNotification(
          ride.organization_id,
          req.passenger_id,
          "RIDE_CANCELLED",
          "Ride Cancelled by Host",
          "The ride scheduled for " + new Date(ride.departure_time).toLocaleTimeString() + " was cancelled: " + reason,
          { ride_id: ride.id }
        );
      }
    }

    await this.logAudit(
      ride.organization_id,
      actorId,
      "RIDE",
      ride.id,
      "CANCEL",
      ride.status,
      updatedRide.status,
      { cancelled_reason: reason }
    );

    return updatedRide;
  }

  public async activateUserWithPessimisticLock(
    token: string,
    passwordHash: string
  ): Promise<{ user: User; capabilities: UserCapability; notifiedAdminCount: number }> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const db = getDb();
    if (db && typeof db.execute === 'function') {
      try {
        await db.execute(sql`ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'USER_JOINED';`);
      } catch {
        try {
          await db.execute(sql`ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'USER_JOINED';`);
        } catch {
          // Ignored if already present or not supported in current dialect
        }
      }
    }

    return await withTransaction(async (tx) => {
      // 1. Pessimistically lock the user row using the invitation token hash
      const userRows = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.invitation_token, tokenHash))
        .for('update');

      const userRow = userRows[0];
      if (!userRow) {
        throw new ActivationError(404, 'ERR_INVALID_TOKEN', 'Invitation token not found or already used.');
      }

      // 2. Validate status
      if (userRow.status !== 'PENDING_VERIFICATION') {
        throw new ActivationError(409, 'ERR_INVALID_STATUS', 'User account is not pending verification.');
      }

      // 3. Validate expiration
      const now = new Date();
      if (userRow.invitation_token_expires_at && new Date(userRow.invitation_token_expires_at) <= now) {
        throw new ActivationError(410, 'ERR_TOKEN_EXPIRED', 'Invitation token has expired. Please ask your administrator to send a new invitation.');
      }

      // 4. Update user to ACTIVE, set password_hash, clear invitation tokens
      await tx
        .update(schema.users)
        .set({
          password_hash: passwordHash,
          status: 'ACTIVE',
          invitation_token: null,
          invitation_token_expires_at: null,
          updated_at: now,
        })
        .where(eq(schema.users.id, userRow.id));

      const updatedUser: User = {
        id: userRow.id,
        organization_id: userRow.organization_id,
        email: userRow.email,
        full_name: userRow.full_name,
        phone_number: userRow.phone_number || '',
        avatar_url: userRow.avatar_url || undefined,
        status: 'ACTIVE',
        work_department: userRow.work_department || undefined,
        work_location: userRow.work_location || undefined,
        password_hash: passwordHash,
        created_at: new Date(userRow.created_at).toISOString(),
        updated_at: now.toISOString(),
      };

      // 5. Fetch user capability
      const capRows = await tx
        .select()
        .from(schema.userCapabilities)
        .where(eq(schema.userCapabilities.user_id, userRow.id));

      let userCap: UserCapability;
      if (capRows[0]) {
        userCap = {
          id: capRows[0].id,
          user_id: capRows[0].user_id,
          organization_id: capRows[0].organization_id,
          can_ride: capRows[0].can_ride,
          can_drive: capRows[0].can_drive,
          is_org_admin: capRows[0].is_org_admin,
          driver_verified_at: capRows[0].driver_verified_at ? new Date(capRows[0].driver_verified_at).toISOString() : undefined,
          created_at: new Date(capRows[0].created_at).toISOString(),
          updated_at: new Date(capRows[0].updated_at).toISOString(),
        };
      } else {
        userCap = {
          id: crypto.randomUUID(),
          user_id: userRow.id,
          organization_id: userRow.organization_id,
          can_ride: true,
          can_drive: false,
          is_org_admin: false,
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        };
      }

      // 6. Find all active administrators in the same organization (excluding newly activated user unless already admin)
      const adminCapRows = await tx
        .select()
        .from(schema.userCapabilities)
        .where(eq(schema.userCapabilities.organization_id, userRow.organization_id));

      const allOrgUsers = await tx
        .select()
        .from(schema.users)
        .where(eq(schema.users.organization_id, userRow.organization_id));

      let notifiedAdminCount = 0;
      for (const cap of adminCapRows) {
        if (!cap.is_org_admin) continue;
        if (cap.user_id === userRow.id && !userCap.is_org_admin) continue;
        const adminUser = allOrgUsers.find((u: any) => u.id === cap.user_id);
        if (!adminUser || adminUser.status !== 'ACTIVE') continue;

        // Prevent duplicate notifications if already notified for this user
        const existingNotifications = await tx
          .select()
          .from(schema.notifications)
          .where(
            and(
              eq(schema.notifications.organization_id, userRow.organization_id),
              eq(schema.notifications.user_id, adminUser.id),
              eq(schema.notifications.type, 'USER_JOINED')
            )
          );

        const alreadyNotified = existingNotifications.some((n: any) => {
          const p = n.payload_json as any;
          return p && p.user_id === userRow.id;
        });
        if (alreadyNotified) continue;

        await tx.insert(schema.notifications).values({
          id: crypto.randomUUID(),
          organization_id: userRow.organization_id,
          user_id: adminUser.id,
          type: 'USER_JOINED',
          channel: 'IN_APP',
          title: 'New employee joined',
          body: `${userRow.full_name} (${userRow.email}) has joined the platform.`,
          payload_json: {
            user_id: userRow.id,
            organization_id: userRow.organization_id,
            department: userRow.work_department || 'General',
          },
          sent_at: now,
          created_at: now,
        });
        notifiedAdminCount++;
      }

      // 7. Append audit log
      await tx.insert(schema.auditLogs).values({
        id: crypto.randomUUID(),
        organization_id: userRow.organization_id,
        actor_user_id: userRow.id,
        entity_type: 'USER',
        entity_id: userRow.id,
        action: 'STATE_TRANSITION',
        from_state: 'PENDING_VERIFICATION',
        to_state: 'ACTIVE',
        metadata_json: {
          activation_method: 'invitation_token',
          admins_notified: notifiedAdminCount,
        },
        created_at: now,
      });

      return { user: updatedUser, capabilities: userCap, notifiedAdminCount };
    });
  }
}
