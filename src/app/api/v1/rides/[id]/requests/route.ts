import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';
import { PickupPoint, DropPoint, RideRequest } from '@/domain/types';
import { rateLimiter } from '@/infrastructure/security/rate-limiter';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;
  const { id: rideId } = await params;

  // Rate limiting: 10 booking creations per minute per user
  const bookingLimit = await rateLimiter.checkShared(`booking:${ctx.user.id}`, 10, 60);
  if (!bookingLimit.allowed) {
    return problemResponse(
      429,
      'Too Many Requests',
      `Booking request rate limit exceeded. Retry in ${bookingLimit.resetSeconds}s`,
      'ERR_RATE_LIMIT_EXCEEDED',
      req.nextUrl.pathname,
      { 'Retry-After': String(bookingLimit.resetSeconds) }
    );
  }

  // Rider capability check
  if (!ctx.capabilities.can_ride) {
    return problemResponse(
      403,
      'Rider Capability Required',
      'User does not have rider authorization to request seats.',
      'ERR_RIDER_CAPABILITY_REQUIRED',
      `/api/v1/rides/${rideId}/requests`
    );
  }

  const store = getRepository();

  try {
    const ride = await store.getRide(rideId);
    // Cross-tenant IDOR protection: return 404 if not found in caller's tenant
    if (!ride || ride.organization_id !== ctx.org.id) {
      return problemResponse(404, 'Ride Not Found', 'The requested ride does not exist.', 'NOT_FOUND', `/api/v1/rides/${rideId}/requests`);
    }

    if (ride.driver_id === ctx.user.id) {
      return problemResponse(400, 'Self Booking Prohibited', 'Hosts cannot book seats on their own rides.', 'SELF_BOOKING_PROHIBITED', `/api/v1/rides/${rideId}/requests`);
    }

    if (ride.status !== 'SCHEDULED') {
      return problemResponse(409, 'Ride Not Available', `Cannot request seat on a ride in '${ride.status}' status.`, 'RIDE_NOT_AVAILABLE', `/api/v1/rides/${rideId}/requests`);
    }

    // Check duplicate active request
    const existingActive = (await store.getAllRideRequests()).find(
      (r) => r.ride_id === rideId && r.passenger_id === ctx.user.id && (r.status === 'PENDING' || r.status === 'ACCEPTED')
    );
    if (existingActive) {
      return problemResponse(409, 'Duplicate Active Request', 'You already have an active or pending request for this ride.', 'DUPLICATE_REQUEST', `/api/v1/rides/${rideId}/requests`);
    }

    const body = await req.json();
    const { requested_seats = 1, rider_note, pickup_point, drop_point } = body;

    if (!pickup_point || !drop_point || !pickup_point.address_text || !drop_point.address_text) {
      return problemResponse(400, 'Invalid Request Payload', 'pickup_point and drop_point with addresses are required.', 'VALIDATION_ERROR', `/api/v1/rides/${rideId}/requests`);
    }

    if (requested_seats > ride.available_seats) {
      return problemResponse(
        409,
        'Insufficient Seats',
        `Requested ${requested_seats} seat(s), but only ${ride.available_seats} remain.`,
        'INSUFFICIENT_SEATS',
        `/api/v1/rides/${rideId}/requests`
      );
    }

    // 1. Create PickupPoint entity
    const pickupId = crypto.randomUUID();
    const pickup: PickupPoint = {
      id: pickupId,
      organization_id: ctx.org.id,
      passenger_id: ctx.user.id,
      address_text: pickup_point.address_text,
      latitude: Number(pickup_point.latitude),
      longitude: Number(pickup_point.longitude),
      landmark_note: pickup_point.landmark_note,
      created_at: new Date().toISOString(),
    };
    await store.setPickupPoint(pickup);

    // 2. Create DropPoint entity
    const dropId = crypto.randomUUID();
    const drop: DropPoint = {
      id: dropId,
      organization_id: ctx.org.id,
      passenger_id: ctx.user.id,
      address_text: drop_point.address_text,
      latitude: Number(drop_point.latitude),
      longitude: Number(drop_point.longitude),
      landmark_note: drop_point.landmark_note,
      created_at: new Date().toISOString(),
    };
    await store.setDropPoint(drop);

    // 3. Create RideRequest entity
    const requestId = crypto.randomUUID();
    const request: RideRequest = {
      id: requestId,
      organization_id: ctx.org.id,
      ride_id: ride.id,
      passenger_id: ctx.user.id,
      pickup_point_id: pickupId,
      drop_point_id: dropId,
      requested_seats: Number(requested_seats),
      status: 'PENDING',
      rider_note: rider_note?.trim(),
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await store.setRideRequest(request);

    // 4. Log audit trail
    store.logAudit(ctx.org.id, ctx.user.id, 'RIDE_REQUEST', request.id, 'CREATE', undefined, 'PENDING', {
      seats: requested_seats,
      ride_id: ride.id,
    });

    // 5. Notify Driver
    store.dispatchNotification(
      ctx.org.id,
      ride.driver_id,
      'RIDE_REQUESTED',
      `New Ride Request from ${ctx.user.full_name}`,
      `${ctx.user.full_name} requested ${requested_seats} seat(s) for your upcoming commute.`,
      { ride_id: ride.id, request_id: request.id }
    );

    return NextResponse.json(request, { status: 202 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(500, 'Server Error', errorMsg, 'INTERNAL_ERROR', `/api/v1/rides/${rideId}/requests`);
  }
}
