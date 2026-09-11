import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';
import { rateLimiter } from '@/infrastructure/security/rate-limiter';
import { evaluatePassengerDetour } from '@/domain/routing/detour-calculator';
import { isTimeInWindow, parseTimestampParam } from '@/domain/routing/corridor-matcher';

function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) return `${name[0]}***@${domain}`;
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}


export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;

  // Rate limit: 30 searches per min per user
  const searchLimit = rateLimiter.check(`search:${ctx.user.id}`, 30, 60);
  if (!searchLimit.allowed) {
    return problemResponse(
      429,
      'Too Many Requests',
      `Search rate limit exceeded. Retry in ${searchLimit.resetSeconds}s`,
      'ERR_RATE_LIMIT_EXCEEDED',
      req.nextUrl.pathname,
      { 'Retry-After': String(searchLimit.resetSeconds) }
    );
  }

  const store = getRepository();

  const searchParams = req.nextUrl.searchParams;
  const originLat = searchParams.get('origin_lat');
  const originLng = searchParams.get('origin_lng');
  const destLat = searchParams.get('dest_lat');
  const destLng = searchParams.get('dest_lng');
  const date = searchParams.get('date');
  const seatsNeeded = searchParams.get('seats_needed') || '1';
  const maxDetour = searchParams.get('max_detour_meters') || '3000';
  const windowStart = searchParams.get('window_start');
  const windowEnd = searchParams.get('window_end');
  const targetTimeParam = searchParams.get('target_time');
  const timeZone = searchParams.get('time_zone') || undefined;
  const dateStartUtc = searchParams.get('date_start_utc') || undefined;
  const dateEndUtc = searchParams.get('date_end_utc') || undefined;

  if (!originLat || !originLng || !destLat || !destLng || !date) {
    return problemResponse(
      400,
      'Missing Search Parameters',
      'origin_lat, origin_lng, dest_lat, dest_lng, and date are required.',
      'VALIDATION_ERROR',
      '/api/v1/rides/search'
    );
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    return problemResponse(
      422,
      'Invalid Date Format',
      'date parameter must be in YYYY-MM-DD format.',
      'VALIDATION_ERROR',
      '/api/v1/rides/search'
    );
  }

  if (timeZone) {
    try {
      new Intl.DateTimeFormat(undefined, { timeZone });
    } catch {
      return problemResponse(
        422,
        'Invalid Time Zone',
        `time_zone "${timeZone}" is not a valid IANA time zone identifier.`,
        'VALIDATION_ERROR',
        '/api/v1/rides/search'
      );
    }
  }

  const parsedOriginLat = parseFloat(originLat);
  const parsedOriginLng = parseFloat(originLng);
  const parsedDestLat = parseFloat(destLat);
  const parsedDestLng = parseFloat(destLng);
  const maxDetourMeters = parseInt(maxDetour, 10);

  const windowStartTime = parseTimestampParam(windowStart, date, timeZone);
  const windowEndTime = parseTimestampParam(windowEnd, date, timeZone);
  const targetTime = parseTimestampParam(targetTimeParam, date, timeZone);

  const windowStartUtc = windowStartTime !== null ? new Date(windowStartTime).toISOString() : undefined;
  const windowEndUtc = windowEndTime !== null ? new Date(windowEndTime).toISOString() : undefined;

  try {
    const rawResults = await store.searchCorridorRides({
      orgId: ctx.org.id,
      originLat: parsedOriginLat,
      originLng: parsedOriginLng,
      destLat: parsedDestLat,
      destLng: parsedDestLng,
      date,
      timeZone,
      dateStartUtc,
      dateEndUtc,
      windowStartUtc,
      windowEndUtc,
      seatsNeeded: parseInt(seatsNeeded, 10),
      maxDetourMeters,
    });

    // 1. Time-window filtering fallback if not handled upstream
    let filteredResults = rawResults;
    if ((windowStart || windowEnd) && !windowStartUtc && !windowEndUtc) {
      filteredResults = rawResults.filter((r) =>
        isTimeInWindow(r.ride.departure_time, windowStart, windowEnd, date, timeZone)
      );
    }

    // 2. Strict chronological waypoint ordering and perpendicular segment detour evaluation
    filteredResults = filteredResults.filter((r) => {
      if (!r.waypoints || r.waypoints.length < 2) return true;
      try {
        const detourEval = evaluatePassengerDetour(
          r.waypoints,
          { latitude: parsedOriginLat, longitude: parsedOriginLng },
          { latitude: parsedDestLat, longitude: parsedDestLng },
          maxDetourMeters
        );
        return detourEval.isWithinDetourLimit && detourEval.isChronologicallyValid;
      } catch {
        return true;
      }
    });

    // 3. Deterministic composite ranking algorithm (Gate 4 Canonical Requirement):
    // MatchScore = (DetourMeters * 0.6) + (DeltaDepartureMinutes * 20) - (AvailableSeats * 100)
    // Lower score ranks first (closest detour, closest departure time, most available seats)
    let refTimeMs: number | null = targetTime;
    if (refTimeMs === null && windowStartTime !== null && windowEndTime !== null) {
      refTimeMs = (windowStartTime + windowEndTime) / 2;
    } else if (refTimeMs === null && windowStartTime !== null) {
      refTimeMs = windowStartTime;
    } else if (refTimeMs === null && windowEndTime !== null) {
      refTimeMs = windowEndTime;
    }

    const scoredResults = filteredResults.map((result) => {
      const detourMeters = result.nearestPickupDistanceMeters + result.nearestDropDistanceMeters;
      const depTimeMs = new Date(result.ride.departure_time).getTime();
      const deltaMinutes = refTimeMs !== null ? Math.abs(depTimeMs - refTimeMs) / 60000 : 0;
      const matchScore =
        Math.round((detourMeters * 0.6 + deltaMinutes * 20 - result.ride.available_seats * 100) * 10) / 10;

      return {
        ...result,
        match_score: matchScore,
        delta_departure_minutes: Math.round(deltaMinutes),
      };
    });

    scoredResults.sort((a, b) => a.match_score - b.match_score);

    // 4. PII Masking: Driver phone number stripped; colleague email masked
    const sanitizedResults = scoredResults.map((result) => {
      const sanitizedDriver = result.driver
        ? {
            id: result.driver.id,
            full_name: result.driver.full_name,
            email: maskEmail(result.driver.email),
            work_department: result.driver.work_department,
            work_location: result.driver.work_location,
            avatar_url: result.driver.avatar_url,
            // phone_number strictly omitted in public search results
          }
        : undefined;

      return {
        ...result,
        driver: sanitizedDriver,
      };
    });

    // Development & client search diagnostics (non-sensitive)
    const storeDiag = (rawResults as any).diagnostics || {};
    const diagnostics = {
      organization_id: ctx.org.id,
      date,
      time_zone: timeZone,
      total_scheduled_rides_in_org:
        storeDiag.total_scheduled_rides_in_org ?? storeDiag.totalScheduledRidesInOrg ?? 0,
      rides_matching_date:
        storeDiag.rides_matching_date ?? storeDiag.ridesMatchingDate ?? 0,
      rides_matching_seats:
        storeDiag.rides_matching_seats ?? storeDiag.ridesMatchingSeats ?? 0,
      rides_matching_corridor:
        storeDiag.rides_matching_corridor ?? storeDiag.ridesMatchingCorridor ?? 0,
      rides_matching_time_window:
        storeDiag.rides_matching_time_window ?? filteredResults.length,
      rides_returned: sanitizedResults.length,
    };

    return NextResponse.json({
      query: {
        origin: { lat: parsedOriginLat, lng: parsedOriginLng },
        destination: { lat: parsedDestLat, lng: parsedDestLng },
        date,
        seats_needed: parseInt(seatsNeeded, 10),
        window_start: windowStart || undefined,
        window_end: windowEnd || undefined,
        target_time: targetTimeParam || undefined,
        time_zone: timeZone || undefined,
      },
      match_count: sanitizedResults.length,
      rides: sanitizedResults,
      diagnostics,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(500, 'Search Error', errorMsg, 'INTERNAL_ERROR', '/api/v1/rides/search');
  }
}
