import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';
import { Ride, RideRoute, RouteWaypoint, BoundingBox } from '@/domain/types';
import { RideStateMachine } from '@/domain/state-machines/ride-state-machine';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;
  const store = getRepository();

  const role = req.nextUrl.searchParams.get('role'); // 'driver' or 'rider'

  if (role === 'driver') {
    const rides = await Promise.all((await store.getAllRides())
      .filter((r) => r.organization_id === ctx.org.id && r.driver_id === ctx.user.id)
      .map(async (ride) => {
        const route = (await store.getAllRideRoutes()).find((rr) => rr.ride_id === ride.id);
        const waypoints = route
          ? (await store.getAllRouteWaypoints())
              .filter((w) => w.route_id === route.id)
              .sort((a, b) => a.stop_order - b.stop_order)
          : [];
        const vehicle = await store.getVehicle(ride.vehicle_id);
        const requests = await Promise.all((await store.getAllRideRequests())
          .filter((req) => req.ride_id === ride.id)
          .map(async (req) => {
            const rawPassenger = await store.getUser(req.passenger_id);
            // PII Masking: Only expose passenger phone number if request is ACCEPTED
            const passenger = rawPassenger
              ? {
                  ...rawPassenger,
                  phone_number: req.status === 'ACCEPTED' ? rawPassenger.phone_number : undefined,
                }
              : undefined;

            const pickup = await store.getPickupPoint(req.pickup_point_id);
            const drop = await store.getDropPoint(req.drop_point_id);
            return { ...req, passenger, pickup, drop };
          }));

        return {
          ...ride,
          route,
          waypoints,
          vehicle,
          requests,
        };
      }));

    return NextResponse.json({ rides });
  }

  // Rider's booked rides
  const myRequests = await Promise.all((await store.getAllRideRequests())
    .filter((req) => req.organization_id === ctx.org.id && req.passenger_id === ctx.user.id)
    .map(async (req) => {
      const ride = await store.getRide(req.ride_id);
      const rawDriver = ride ? await store.getUser(ride.driver_id) : undefined;
      // PII Masking: Only expose driver phone number if booking is ACCEPTED
      const driver = rawDriver
        ? {
            ...rawDriver,
            phone_number: req.status === 'ACCEPTED' ? rawDriver.phone_number : undefined,
          }
        : undefined;

      const vehicle = ride ? await store.getVehicle(ride.vehicle_id) : undefined;
      const pickup = await store.getPickupPoint(req.pickup_point_id);
      const drop = await store.getDropPoint(req.drop_point_id);
      return {
        request: req,
        ride,
        driver,
        vehicle,
        pickup,
        drop,
      };
    }));

  return NextResponse.json({ bookings: myRequests });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;

  // Driver capability check
  if (!ctx.capabilities.can_drive) {
    return problemResponse(
      403,
      'Driver Capability Required',
      'User does not have driver authorization to publish rides',
      'ERR_DRIVER_CAPABILITY_REQUIRED',
      req.nextUrl.pathname
    );
  }

  const store = getRepository();

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

    if (!vehicle_id || !departure_time || !arrival_time_estimated || total_seats_offered === undefined || !routeData) {
      return problemResponse(
        400,
        'Invalid Ride Payload',
        'vehicle_id, departure_time, arrival_time_estimated, total_seats_offered, and route are required.',
        'VALIDATION_ERROR',
        '/api/v1/rides'
      );
    }

    // Tenant and ownership validation on vehicle
    const vehicle = await store.getVehicle(vehicle_id);
    if (!vehicle || vehicle.organization_id !== ctx.org.id) {
      return problemResponse(404, 'Vehicle Not Found', 'The specified vehicle does not exist.', 'NOT_FOUND', '/api/v1/rides');
    }

    if (vehicle.owner_id !== ctx.user.id) {
      return problemResponse(
        403,
        'Forbidden Vehicle',
        'You can only publish rides using a vehicle registered to your account.',
        'FORBIDDEN_VEHICLE',
        '/api/v1/rides'
      );
    }

    if (vehicle.status !== 'ACTIVE') {
      return problemResponse(
        400,
        'Inactive Vehicle',
        'Cannot publish rides using an inactive vehicle.',
        'ERR_VEHICLE_INACTIVE',
        '/api/v1/rides'
      );
    }

    const maxAllowedSeats = vehicle.max_passenger_capacity || Math.max(1, vehicle.total_seats - 1);
    if (Number(total_seats_offered) > maxAllowedSeats || Number(total_seats_offered) < 1) {
      return problemResponse(
        400,
        'Capacity Exceeded',
        `Cannot offer ${total_seats_offered} seats. Vehicle only has ${maxAllowedSeats} passenger seats available.`,
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

    // Server-side route coordinates and bounds validation
    const originLat = Number(routeData.origin_latitude);
    const originLng = Number(routeData.origin_longitude);
    const destLat = Number(routeData.destination_latitude);
    const destLng = Number(routeData.destination_longitude);

    if (
      isNaN(originLat) || originLat < -90 || originLat > 90 ||
      isNaN(originLng) || originLng < -180 || originLng > 180 ||
      isNaN(destLat) || destLat < -90 || destLat > 90 ||
      isNaN(destLng) || destLng < -180 || destLng > 180
    ) {
      return problemResponse(
        422,
        'Invalid Route Coordinates',
        'Origin and destination must have valid latitude (-90 to 90) and longitude (-180 to 180).',
        'VALIDATION_ERROR',
        '/api/v1/rides'
      );
    }

    const rawWaypoints: Array<{
      stop_order?: number;
      point_type?: 'ORIGIN' | 'CORRIDOR' | 'DESTINATION';
      address_text?: string;
      latitude: number;
      longitude: number;
      place_id?: string;
      estimated_arrival_offset_seconds?: number;
    }> = Array.isArray(routeData.waypoints) ? routeData.waypoints : [];

    if (rawWaypoints.length > 12) {
      return problemResponse(
        422,
        'Too Many Waypoints',
        'Route exceeds maximum allowed intermediate stops.',
        'VALIDATION_ERROR',
        '/api/v1/rides'
      );
    }

    for (let i = 0; i < rawWaypoints.length; i++) {
      const wp = rawWaypoints[i];
      const wLat = Number(wp.latitude);
      const wLng = Number(wp.longitude);
      if (isNaN(wLat) || wLat < -90 || wLat > 90 || isNaN(wLng) || wLng < -180 || wLng > 180) {
        return problemResponse(
          422,
          'Invalid Waypoint Coordinates',
          `Waypoint at index ${i} has invalid coordinates.`,
          'VALIDATION_ERROR',
          '/api/v1/rides'
        );
      }
    }

    // Build complete authoritative waypoint sequence: Origin -> Intermediate Stops -> Destination
    const synthesizedWaypoints: Array<{
      point_type: 'ORIGIN' | 'CORRIDOR' | 'DESTINATION';
      address_text?: string;
      latitude: number;
      longitude: number;
      place_id?: string;
      estimated_arrival_offset_seconds: number;
    }> = [];

    // 1. Origin waypoint (stop_order 0)
    synthesizedWaypoints.push({
      point_type: 'ORIGIN',
      address_text: routeData.origin_address || 'Origin',
      latitude: originLat,
      longitude: originLng,
      place_id: routeData.origin_place_id,
      estimated_arrival_offset_seconds: 0,
    });

    // 2. Intermediate corridor waypoints
    for (const wp of rawWaypoints) {
      const wLat = Number(wp.latitude);
      const wLng = Number(wp.longitude);
      const isOrigin = Math.abs(wLat - originLat) < 0.0001 && Math.abs(wLng - originLng) < 0.0001;
      const isDest = Math.abs(wLat - destLat) < 0.0001 && Math.abs(wLng - destLng) < 0.0001;
      if (isOrigin || isDest) continue;

      synthesizedWaypoints.push({
        point_type: 'CORRIDOR',
        address_text: wp.address_text,
        latitude: wLat,
        longitude: wLng,
        place_id: wp.place_id,
        estimated_arrival_offset_seconds: Number(wp.estimated_arrival_offset_seconds || 0),
      });
    }

    // 3. Destination waypoint (stop_order N-1)
    synthesizedWaypoints.push({
      point_type: 'DESTINATION',
      address_text: routeData.destination_address || 'Destination',
      latitude: destLat,
      longitude: destLng,
      place_id: routeData.destination_place_id,
      estimated_arrival_offset_seconds: Math.max(0, Number(routeData.total_duration_seconds || 0)),
    });

    let minLat = Math.min(originLat, destLat);
    let maxLat = Math.max(originLat, destLat);
    let minLng = Math.min(originLng, destLng);
    let maxLng = Math.max(originLng, destLng);

    synthesizedWaypoints.forEach((w) => {
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

    const encodedPolyline =
      typeof routeData.encoded_polyline === 'string' && routeData.encoded_polyline.trim().length > 0
        ? routeData.encoded_polyline.trim()
        : undefined;

    const newRoute: RideRoute = {
      id: routeId,
      ride_id: rideId,
      organization_id: ctx.org.id,
      origin_address: routeData.origin_address || 'Origin',
      origin_latitude: originLat,
      origin_longitude: originLng,
      destination_address: routeData.destination_address || 'Destination',
      destination_latitude: destLat,
      destination_longitude: destLng,
      total_distance_meters: Math.max(0, Number(routeData.total_distance_meters || 0)),
      total_duration_seconds: Math.max(0, Number(routeData.total_duration_seconds || 0)),
      min_latitude: minLat,
      max_latitude: maxLat,
      min_longitude: minLng,
      max_longitude: maxLng,
      bounding_box: bbox,
      encoded_polyline: encodedPolyline,
      google_route_id: typeof routeData.google_route_id === 'string' ? routeData.google_route_id : undefined,
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

    // Transition to SCHEDULED state
    const scheduledRide = RideStateMachine.publish(newRide);
    scheduledRide.status = 'SCHEDULED';

    // Build authoritative waypoints with strict sequential stop_order
    const savedWaypoints: RouteWaypoint[] = [];
    for (let idx = 0; idx < synthesizedWaypoints.length; idx++) {
      const w = synthesizedWaypoints[idx];
      const waypoint: RouteWaypoint = {
        id: crypto.randomUUID(),
        route_id: routeId,
        organization_id: ctx.org.id,
        stop_order: idx,
        point_type: w.point_type,
        address_text: w.address_text,
        latitude: w.latitude,
        longitude: w.longitude,
        estimated_arrival_offset_seconds: w.estimated_arrival_offset_seconds,
        created_at: new Date().toISOString(),
      };
      savedWaypoints.push(waypoint);
    }

    const result = await store.createRideWithRoute(scheduledRide, newRoute, savedWaypoints, {
      total_seats: scheduledRide.total_seats_offered,
      departure_time: scheduledRide.departure_time,
      total_distance_meters: newRoute.total_distance_meters,
      total_duration_seconds: newRoute.total_duration_seconds,
      has_polyline: Boolean(encodedPolyline),
      waypoints_count: savedWaypoints.length,
    });

    return NextResponse.json(
      {
        ride: result.ride,
        route: result.route,
        waypoints: result.waypoints,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(500, 'Server Error', errorMsg, 'INTERNAL_ERROR', '/api/v1/rides');
  }
}
