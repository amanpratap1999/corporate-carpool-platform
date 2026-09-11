import { Coordinate, projectPointToSegment, calculateHaversineDistanceMeters } from './detour-calculator';
import { RideRoute, RouteWaypoint, UUID } from '../types';

export interface CorridorMatchResult {
  matches: boolean;
  nearestPickupDistanceMeters: number;
  nearestDropDistanceMeters: number;
  pickupProgress: number;
  dropProgress: number;
  reason?: string;
}

export interface SearchDiagnostics {
  organization_id: UUID;
  date: string;
  time_zone?: string;
  total_scheduled_rides_in_org: number;
  rides_matching_date: number;
  rides_matching_seats: number;
  rides_matching_corridor: number;
  rides_matching_time_window: number;
  rides_returned: number;
}

/**
 * Decodes a Google Encoded Polyline into an array of latitude/longitude coordinates.
 */
export function decodePolyline(encoded: string): Coordinate[] {
  if (!encoded || typeof encoded !== 'string') return [];
  const points: Coordinate[] = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  try {
    while (index < len) {
      let b: number;
      let shift = 0;
      let result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlat = result & 1 ? ~(result >> 1) : result >> 1;
      lat += dlat;

      shift = 0;
      result = 0;
      do {
        b = encoded.charCodeAt(index++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const dlng = result & 1 ? ~(result >> 1) : result >> 1;
      lng += dlng;

      points.push({ latitude: lat / 1e5, longitude: lng / 1e5 });
    }
  } catch {
    // Return whatever points were decoded successfully
  }

  return points;
}

/**
 * Accurately parses a local date (YYYY-MM-DD) and local time (HH:mm or HH:mm:ss)
 * in an IANA time zone (e.g. 'Asia/Kolkata', 'America/Los_Angeles') to a UTC timestamp in ms.
 */
export function parseLocalTimeToUtcMs(dateStr: string, timeStr: string, timeZone: string): number | null {
  if (!dateStr || !timeStr || !timeZone) return null;
  const tMatch = timeStr.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!tMatch) return null;
  const hours = parseInt(tMatch[1], 10);
  const minutes = parseInt(tMatch[2], 10);
  const seconds = tMatch[3] ? parseInt(tMatch[3], 10) : 0;

  const dParts = dateStr.trim().split('-').map(Number);
  if (dParts.length !== 3 || dParts.some(isNaN)) return null;
  const [year, month, day] = dParts;

  try {
    const guessUtc = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));

    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hour12: false,
    });

    const parts = formatter.formatToParts(guessUtc);
    const getPart = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || '0', 10);
    const locYear = getPart('year');
    const locMonth = getPart('month');
    const locDay = getPart('day');
    let locHour = getPart('hour');
    if (locHour === 24) locHour = 0;
    const locMinute = getPart('minute');
    const locSecond = getPart('second');

    const locMsInTz = Date.UTC(locYear, locMonth - 1, locDay, locHour, locMinute, locSecond);
    const offsetMs = locMsInTz - guessUtc.getTime();

    return guessUtc.getTime() - offsetMs;
  } catch {
    return null;
  }
}

/**
 * Parses timestamp parameter from request.
 * - If full ISO string with Z or offset, parses directly.
 * - If ISO string with T, converts properly.
 * - If HH:mm or HH:mm:ss, uses timeZone and baseDate.
 */
export function parseTimestampParam(
  val: string | null | undefined,
  baseDate: string,
  timeZone?: string
): number | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed) return null;

  // 1. Full ISO timestamp with Z or timezone offset (e.g. 2026-09-12T03:00:00.000Z or +05:30)
  if (trimmed.includes('T') && (trimmed.endsWith('Z') || /[+-]\d{2}(:\d{2})?$/.test(trimmed))) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  // 2. ISO timestamp without offset (e.g. 2026-09-12T08:30:00)
  if (trimmed.includes('T')) {
    const [dPart, tPart] = trimmed.split('T');
    if (timeZone) {
      const ms = parseLocalTimeToUtcMs(dPart, tPart, timeZone);
      if (ms !== null) return ms;
    }
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  // 3. Plain HH:mm or HH:mm:ss
  if (/^\d{1,2}:\d{2}(?::\d{2})?$/.test(trimmed)) {
    if (timeZone) {
      const ms = parseLocalTimeToUtcMs(baseDate, trimmed, timeZone);
      if (ms !== null) return ms;
    }
    const d = new Date(`${baseDate}T${trimmed.padStart(5, '0')}:00Z`);
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  const fallback = new Date(trimmed);
  return isNaN(fallback.getTime()) ? null : fallback.getTime();
}

/**
 * Timezone-aware date filter that matches rides scheduled on the user's local service date.
 * Matches: departure_time >= UTC start AND departure_time < UTC next-day start.
 */
export function isRideOnServiceDate(
  departureTime: string | Date | undefined | null,
  dateStr: string,
  timeZone?: string,
  dateStartUtc?: string,
  dateEndUtc?: string
): boolean {
  if (!departureTime || !dateStr) return false;
  const depDate = departureTime instanceof Date ? departureTime : new Date(departureTime);
  const depMs = depDate.getTime();
  if (isNaN(depMs)) return false;

  if (dateStartUtc && dateEndUtc) {
    const startMs = new Date(dateStartUtc).getTime();
    const endMs = new Date(dateEndUtc).getTime();
    if (!isNaN(startMs) && !isNaN(endMs)) {
      return depMs >= startMs && depMs < endMs;
    }
  }

  if (timeZone) {
    const startMs = parseLocalTimeToUtcMs(dateStr, '00:00:00', timeZone);
    if (startMs !== null) {
      const nextDayMs = startMs + 24 * 60 * 60 * 1000;
      return depMs >= startMs && depMs < nextDayMs;
    }
  }

  // Fallback to isSameServiceDate
  return isSameServiceDate(departureTime, dateStr);
}

/**
 * Robust date comparison that handles UTC timestamps, local dates, and timezone shifts.
 */
export function isSameServiceDate(
  departureTime: string | Date | undefined | null,
  searchDateStr: string
): boolean {
  if (!departureTime || !searchDateStr) return false;
  const trimmedSearch = searchDateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedSearch)) return false;

  let depStr: string;
  let depDate: Date;
  if (departureTime instanceof Date) {
    depDate = departureTime;
    depStr = departureTime.toISOString();
  } else {
    depStr = String(departureTime).trim();
    depDate = new Date(depStr);
  }

  if (depStr.startsWith(trimmedSearch)) return true;
  if (isNaN(depDate.getTime())) return false;

  const utcDate = depDate.toISOString().slice(0, 10);
  if (utcDate === trimmedSearch) return true;

  const localYear = depDate.getFullYear();
  const localMonth = String(depDate.getMonth() + 1).padStart(2, '0');
  const localDay = String(depDate.getDate()).padStart(2, '0');
  const localDate = `${localYear}-${localMonth}-${localDay}`;
  if (localDate === trimmedSearch) return true;

  const depTimeMs = depDate.getTime();
  const dayStartMs = Date.parse(`${trimmedSearch}T00:00:00.000Z`);
  const dayEndMs = Date.parse(`${trimmedSearch}T23:59:59.999Z`);
  const MAX_TZ_OFFSET_MS = 14 * 60 * 60 * 1000;

  if (depTimeMs >= dayStartMs - MAX_TZ_OFFSET_MS && depTimeMs <= dayEndMs + MAX_TZ_OFFSET_MS) {
    for (let halfHours = -24; halfHours <= 28; halfHours++) {
      const shifted = new Date(depTimeMs + halfHours * 30 * 60 * 1000);
      if (shifted.toISOString().slice(0, 10) === trimmedSearch) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Checks if a ride departure time falls within the requested time-of-day window.
 */
export function isTimeInWindow(
  departureTime: string | Date,
  windowStart?: string | null,
  windowEnd?: string | null,
  baseDate?: string,
  timeZone?: string
): boolean {
  if (!windowStart && !windowEnd) return true;
  const depDate = departureTime instanceof Date ? departureTime : new Date(departureTime);
  const depMs = depDate.getTime();
  if (isNaN(depMs)) return false;

  const startMs = windowStart ? parseTimestampParam(windowStart, baseDate || '', timeZone) : null;
  const endMs = windowEnd ? parseTimestampParam(windowEnd, baseDate || '', timeZone) : null;

  if (startMs !== null && depMs < startMs) return false;
  if (endMs !== null && depMs > endMs) return false;

  return true;
}

/**
 * Evaluates corridor matching between a passenger trip and a driver route.
 * Invariants:
 * 1. Both pickup AND drop must be within maxDetourMeters of host route.
 * 2. Complete route is evaluated (origin, intermediate waypoints, destination).
 * 3. Pickup progress must be before or equal to drop progress along route.
 * 4. Geographically unrelated locations are strictly rejected.
 */
export function matchCorridor(
  route: RideRoute,
  waypoints: RouteWaypoint[],
  passengerOrigin: Coordinate,
  passengerDest: Coordinate,
  maxDetourMeters: number = 3000
): CorridorMatchResult {
  const originLat = Number(route.origin_latitude);
  const originLng = Number(route.origin_longitude);
  const destLat = Number(route.destination_latitude);
  const destLng = Number(route.destination_longitude);

  if (isNaN(originLat) || isNaN(originLng) || isNaN(destLat) || isNaN(destLng)) {
    return {
      matches: false,
      nearestPickupDistanceMeters: Infinity,
      nearestDropDistanceMeters: Infinity,
      pickupProgress: 0,
      dropProgress: 0,
      reason: 'INVALID_ROUTE_COORDINATES',
    };
  }

  const pLat = Number(passengerOrigin.latitude);
  const pLng = Number(passengerOrigin.longitude);
  const dLat = Number(passengerDest.latitude);
  const dLng = Number(passengerDest.longitude);

  if (isNaN(pLat) || isNaN(pLng) || isNaN(dLat) || isNaN(dLng)) {
    return {
      matches: false,
      nearestPickupDistanceMeters: Infinity,
      nearestDropDistanceMeters: Infinity,
      pickupProgress: 0,
      dropProgress: 0,
      reason: 'INVALID_PASSENGER_COORDINATES',
    };
  }

  // Direct distance to endpoints
  const distToOrigin = calculateHaversineDistanceMeters(pLat, pLng, originLat, originLng);
  const distToDest = calculateHaversineDistanceMeters(dLat, dLng, destLat, destLng);

  // 1. Exact or near-exact endpoint match
  if (distToOrigin <= maxDetourMeters && distToDest <= maxDetourMeters) {
    return {
      matches: true,
      nearestPickupDistanceMeters: Math.round(distToOrigin),
      nearestDropDistanceMeters: Math.round(distToDest),
      pickupProgress: 0,
      dropProgress: 1,
    };
  }

  // 2. Bounding Box Pre-filter strictly sized to maxDetourMeters
  let minLat = Math.min(originLat, destLat);
  let maxLat = Math.max(originLat, destLat);
  let minLng = Math.min(originLng, destLng);
  let maxLng = Math.max(originLng, destLng);

  for (const wp of waypoints) {
    const wLat = Number(wp.latitude);
    const wLng = Number(wp.longitude);
    if (!isNaN(wLat) && !isNaN(wLng)) {
      if (wLat < minLat) minLat = wLat;
      if (wLat > maxLat) maxLat = wLat;
      if (wLng < minLng) minLng = wLng;
      if (wLng > maxLng) maxLng = wLng;
    }
  }

  // Latitude margin: ~111,000 meters per degree
  const marginLat = (maxDetourMeters / 111000) * 1.25;
  // Longitude margin: adjusted for cosine of average latitude
  const avgLatRad = (((minLat + maxLat) / 2) * Math.PI) / 180;
  const cosLat = Math.max(0.2, Math.cos(avgLatRad));
  const marginLng = (maxDetourMeters / (111000 * cosLat)) * 1.25;

  const pOriginInBBox =
    pLat >= minLat - marginLat &&
    pLat <= maxLat + marginLat &&
    pLng >= minLng - marginLng &&
    pLng <= maxLng + marginLng;

  const pDestInBBox =
    dLat >= minLat - marginLat &&
    dLat <= maxLat + marginLat &&
    dLng >= minLng - marginLng &&
    dLng <= maxLng + marginLng;

  // Both pickup AND drop must lie within the route bounding box
  if (!pOriginInBBox || !pDestInBBox) {
    return {
      matches: false,
      nearestPickupDistanceMeters: Math.round(distToOrigin),
      nearestDropDistanceMeters: Math.round(distToDest),
      pickupProgress: 0,
      dropProgress: 0,
      reason: 'OUTSIDE_BOUNDING_BOX',
    };
  }

  // 3. Build authoritative trajectory points
  let trajectoryPoints: Coordinate[] = [];
  if (route.encoded_polyline && route.encoded_polyline.trim().length > 0) {
    trajectoryPoints = decodePolyline(route.encoded_polyline);
  }

  // Fall back to ordered waypoints if polyline is unavailable
  if (trajectoryPoints.length < 2) {
    trajectoryPoints = [{ latitude: originLat, longitude: originLng }];
    const sortedWps = [...waypoints]
      .filter((w) => !isNaN(Number(w.latitude)) && !isNaN(Number(w.longitude)))
      .sort((a, b) => a.stop_order - b.stop_order);

    for (const wp of sortedWps) {
      const wLat = Number(wp.latitude);
      const wLng = Number(wp.longitude);
      if (Math.abs(wLat - originLat) < 0.0001 && Math.abs(wLng - originLng) < 0.0001) continue;
      if (Math.abs(wLat - destLat) < 0.0001 && Math.abs(wLng - destLng) < 0.0001) continue;
      trajectoryPoints.push({ latitude: wLat, longitude: wLng });
    }
    trajectoryPoints.push({ latitude: destLat, longitude: destLng });
  }

  // 4. Project passenger origin and destination along trajectory segments
  let minPickupDistance = Infinity;
  let pickupProgress = 0;

  let minDropDistance = Infinity;
  let dropProgress = 0;

  for (let i = 0; i < trajectoryPoints.length - 1; i++) {
    const ptA = trajectoryPoints[i];
    const ptB = trajectoryPoints[i + 1];

    const pProj = projectPointToSegment({ latitude: pLat, longitude: pLng }, ptA, ptB);
    if (pProj.distanceMeters < minPickupDistance) {
      minPickupDistance = pProj.distanceMeters;
      pickupProgress = i + pProj.t;
    }

    const dProj = projectPointToSegment({ latitude: dLat, longitude: dLng }, ptA, ptB);
    if (dProj.distanceMeters < minDropDistance) {
      minDropDistance = dProj.distanceMeters;
      dropProgress = i + dProj.t;
    }
  }

  // Also check direct distance to endpoints
  if (distToOrigin < minPickupDistance) {
    minPickupDistance = distToOrigin;
    pickupProgress = 0;
  }

  if (distToDest < minDropDistance) {
    minDropDistance = distToDest;
    dropProgress = trajectoryPoints.length - 1;
  }

  // Both pickup AND drop must be within maxDetourMeters
  const isWithinDetourLimit =
    minPickupDistance <= maxDetourMeters && minDropDistance <= maxDetourMeters;

  // Pickup must occur before or at the same location as drop along the host's route
  const isChronologicallyValid = pickupProgress <= dropProgress + 0.001;

  return {
    matches: isWithinDetourLimit && isChronologicallyValid,
    nearestPickupDistanceMeters: Math.round(minPickupDistance),
    nearestDropDistanceMeters: Math.round(minDropDistance),
    pickupProgress,
    dropProgress,
    reason: !isWithinDetourLimit
      ? 'EXCEEDS_DETOUR'
      : !isChronologicallyValid
      ? 'REVERSE_DIRECTION'
      : undefined,
  };
}
