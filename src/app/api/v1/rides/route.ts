import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext, problemResponse } from '@/services/api-context';
import { initializeSeedData } from '@/services/seed-data';
import { Ride, RideRoute, RouteWaypoint, BoundingBox } from '@/domain/types';
import { RideStateMachine } from '@/domain/state-machines/ride-state-machine';

export async function GET(req: NextRequest) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);

  const role = req.nextUrl.searchParams.get('role'); // 'driver' or 'rider'

  if (role === 'driver') {
    const rides = Array.from(store.rides.values())
      .filter((r) => r.organization_id === ctx.org.id && r.driver_id === ctx.user.id)
      .map((ride) => {
        const route = Array.from(store.rideRoutes.values()).find((rr) => rr.ride_id === ride.id);
        const waypoints = route
          ? Array.from(store.routeWaypoints.values())
              .filter((w) => w.route_id === route.id)
              .sort((a, b) => a.stop_order - b.stop_order)
          : [];
        const vehicle = store.vehicles.get(ride.vehicle_id);
        const requests = Array.from(store.rideRequests.values())
          .filter((req) => req.ride_id === ride.id)
          .map((req) => {
            const passenger = store.users.get(req.passenger_id);
            const pickup = store.pickupPoints.get(req.pickup_point_id);
            const drop = store.dropPoints.get(req.drop_point_id);
            return { ...req, passenger, pickup, drop };
          });

        return {
          ...ride,
          route,
          waypoints,
          vehicle,
          requests,
        };
      });

    return NextResponse.json({ rides });
  }

  // Rider's booked rides
  const myRequests = Array.from(store.rideRequests.values())
    .filter((req) => req.organization_id === ctx.org.id && req.passenger_id === ctx.user.id)
    .map((req) => {
      const ride = store.rides.get(req.ride_id);
      const driver = ride ? store.users.get(ride.driver_id) : undefined;
      const vehicle = ride ? store.vehicles.get(ride.vehicle_id) : undefined;
      const pickup = store.pickupPoints.get(req.pickup_point_id);
      const drop = store.dropPoints.get(req.drop_point_id);
      return {
        request: req,
        ride,
        driver,
        vehicle,
        pickup,
        drop,
      };
    });

  return NextResponse.json({ bookings: myRequests });
}

export async function POST(req: NextRequest) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);

  try {
    const body = await req.json();
    const {
      vehicle_id,
      departure_time,
      arrival_time_estimated,
      total_seats_offered,
      cost_per_seat_cents,
      notes,
      route: routeData,
    } = body;

    if (!vehicle_id || !departure_time || !arrival_time_estimated || !total_seats_offered || !routeData) {
      return problemResponse(
        400,
        'Invalid Ride Payload',
        'vehicle_id, departure_time, arrival_time_estimated, total_seats_offered, and route are required.',
        'VALIDATION_ERROR',
        '/api/v1/rides'
      );
    }

    const vehicle = store.vehicles.get(vehicle_id);
    if (!vehicle) {
      return problemResponse(404, 'Vehicle Not Found', 'The specified vehicle does not exist.', 'NOT_FOUND', '/api/v1/rides');
    }

    if (total_seats_offered > vehicle.total_seats - 1) {
      return problemResponse(
        400,
        'Capacity Exceeded',
        `Cannot offer ${total_seats_offered} seats. Vehicle only has ${vehicle.total_seats - 1} passenger seats available.`,
        'CAPACITY_EXCEEDED',
        '/api/v1/rides'
      );
    }

    const rideId = crypto.randomUUID();
    const routeId = crypto.randomUUID();

    // Compute bounding box
    const waypointsData: Array<{
      stop_order: number;
      point_type: 'ORIGIN' | 'CORRIDOR' | 'DESTINATION';
      address_text?: string;
      latitude: number;
      longitude: number;
      estimated_arrival_offset_seconds?: number;
    }> = routeData.waypoints || [];

    let minLat = Math.min(routeData.origin_latitude, routeData.destination_latitude);
    let maxLat = Math.max(routeData.origin_latitude, routeData.destination_latitude);
    let minLng = Math.min(routeData.origin_longitude, routeData.destination_longitude);
    let maxLng = Math.max(routeData.origin_longitude, routeData.destination_longitude);

    waypointsData.forEach((w) => {
      if (w.latitude < minLat) minLat = w.latitude;
      if (w.latitude > maxLat) maxLat = w.latitude;
      if (w.longitude < minLng) minLng = w.longitude;
      if (w.longitude > maxLng) maxLng = w.longitude;
    });

    const bbox: BoundingBox = {
      min_lat: minLat,
      max_lat: maxLat,
      min_lng: minLng,
      max_lng: maxLng,
    };

    const newRoute: RideRoute = {
      id: routeId,
      ride_id: rideId,
      organization_id: ctx.org.id,
      origin_address: routeData.origin_address,
      origin_latitude: Number(routeData.origin_latitude),
      origin_longitude: Number(routeData.origin_longitude),
      destination_address: routeData.destination_address,
      destination_latitude: Number(routeData.destination_latitude),
      destination_longitude: Number(routeData.destination_longitude),
      total_distance_meters: Number(routeData.total_distance_meters || 45000),
      total_duration_seconds: Number(routeData.total_duration_seconds || 2700),
      min_latitude: minLat,
      max_latitude: maxLat,
      min_longitude: minLng,
      max_longitude: maxLng,
      bounding_box: bbox,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const newRide: Ride = {
      id: rideId,
      organization_id: ctx.org.id,
      driver_id: ctx.user.id,
      vehicle_id,
      status: 'DRAFT',
      departure_time,
      arrival_time_estimated,
      total_seats_offered: Number(total_seats_offered),
      available_seats: Number(total_seats_offered),
      cost_per_seat_cents: Number(cost_per_seat_cents || 0),
      currency: 'USD',
      notes,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Transition to SCHEDULED
    const scheduledRide = RideStateMachine.publish(newRide);

    store.rides.set(scheduledRide.id, scheduledRide);
    store.rideRoutes.set(newRoute.id, newRoute);

    // Save waypoints
    waypointsData.forEach((w) => {
      const waypoint: RouteWaypoint = {
        id: crypto.randomUUID(),
        route_id: routeId,
        organization_id: ctx.org.id,
        stop_order: w.stop_order,
        point_type: w.point_type,
        address_text: w.address_text,
        latitude: Number(w.latitude),
        longitude: Number(w.longitude),
        estimated_arrival_offset_seconds: Number(w.estimated_arrival_offset_seconds || 0),
        created_at: new Date().toISOString(),
      };
      store.routeWaypoints.set(waypoint.id, waypoint);
    });

    store.logAudit(ctx.org.id, ctx.user.id, 'RIDE', scheduledRide.id, 'CREATE', 'DRAFT', 'SCHEDULED', {
      total_seats: scheduledRide.total_seats_offered,
      departure_time: scheduledRide.departure_time,
    });

    return NextResponse.json(
      {
        ride: scheduledRide,
        route: newRoute,
        waypoints: waypointsData,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(500, 'Server Error', errorMsg, 'INTERNAL_ERROR', '/api/v1/rides');
  }
}
