/**
 * Authoritative Driver Route Invariants & Detour Calculation
 * Computes exact perpendicular distance from passenger boarding points
 * to driver route segments without altering the driver's authoritative trajectory.
 */

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteSegmentWaypoint extends Coordinate {
  stop_order: number;
  address_text?: string;
  estimated_arrival_offset_seconds?: number;
}

export interface DetourEvaluationResult {
  nearestPickupDistanceMeters: number;
  nearestDropDistanceMeters: number;
  totalDetourMeters: number;
  maxAllowedDetourMeters: number;
  isWithinDetourLimit: boolean;
  isChronologicallyValid: boolean;
  nearestPickupStopOrder: number;
  nearestDropStopOrder: number;
  pickupRouteProgress?: number;
  dropRouteProgress?: number;
}

/**
 * Calculates geodesic distance between two points using the Haversine formula
 */
export function calculateHaversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(R * c);
}

/**
 * Projects a point P onto segment AB and returns distance and normalized parameter t in [0, 1]
 */
export function projectPointToSegment(
  p: Coordinate,
  a: Coordinate,
  b: Coordinate
): { distanceMeters: number; t: number } {
  const dAB = calculateHaversineDistanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
  if (dAB === 0) {
    return {
      distanceMeters: calculateHaversineDistanceMeters(p.latitude, p.longitude, a.latitude, a.longitude),
      t: 0,
    };
  }

  // Vector projection in flat space approximation for short corridor segments
  const xA = a.longitude;
  const yA = a.latitude;
  const xB = b.longitude;
  const yB = b.latitude;
  const xP = p.longitude;
  const yP = p.latitude;

  const dx = xB - xA;
  const dy = yB - yA;

  let t = ((xP - xA) * dx + (yP - yA) * dy) / (dx * dx + dy * dy);
  t = Math.max(0, Math.min(1, t));

  const projLat = yA + t * dy;
  const projLng = xA + t * dx;

  const distanceMeters = calculateHaversineDistanceMeters(p.latitude, p.longitude, projLat, projLng);
  return { distanceMeters, t };
}

/**
 * Calculates perpendicular (cross-track) distance from a point P to line segment AB
 */
export function distanceToSegmentMeters(
  p: Coordinate,
  a: Coordinate,
  b: Coordinate
): number {
  return projectPointToSegment(p, a, b).distanceMeters;
}

/**
 * Strictly evaluates commuter pickup and drop points against an authoritative driver route.
 * Invariants enforced:
 * 1. Driver route waypoints are completely immutable.
 * 2. Passenger pickup must lie within maxDetourMeters of driver corridor.
 * 3. Passenger drop must lie within maxDetourMeters of driver corridor.
 * 4. Chronological consistency: Pickup position along route must precede drop position.
 */
export function evaluatePassengerDetour(
  driverWaypoints: RouteSegmentWaypoint[],
  passengerPickup: Coordinate,
  passengerDrop: Coordinate,
  maxDetourMeters: number = 3000
): DetourEvaluationResult {
  if (driverWaypoints.length < 2) {
    throw new Error('Driver route must contain at least 2 waypoints (origin and destination).');
  }

  const sortedWaypoints = [...driverWaypoints].sort((a, b) => a.stop_order - b.stop_order);

  let minPickupDistance = Infinity;
  let pickupRouteProgress = 0;
  let nearestPickupStopOrder = sortedWaypoints[0].stop_order;

  let minDropDistance = Infinity;
  let dropRouteProgress = sortedWaypoints.length - 1;
  let nearestDropStopOrder = sortedWaypoints[sortedWaypoints.length - 1].stop_order;

  // 1. Evaluate distance and route progress against segments
  for (let i = 0; i < sortedWaypoints.length - 1; i++) {
    const wpA = sortedWaypoints[i];
    const wpB = sortedWaypoints[i + 1];

    const pickupProj = projectPointToSegment(passengerPickup, wpA, wpB);
    if (pickupProj.distanceMeters < minPickupDistance) {
      minPickupDistance = pickupProj.distanceMeters;
      pickupRouteProgress = i + pickupProj.t;
      nearestPickupStopOrder = pickupProj.t < 0.5 ? wpA.stop_order : wpB.stop_order;
    }

    const dropProj = projectPointToSegment(passengerDrop, wpA, wpB);
    if (dropProj.distanceMeters < minDropDistance) {
      minDropDistance = dropProj.distanceMeters;
      dropRouteProgress = i + dropProj.t;
      nearestDropStopOrder = dropProj.t < 0.5 ? wpA.stop_order : wpB.stop_order;
    }
  }

  const isWithinDetourLimit =
    minPickupDistance <= maxDetourMeters && minDropDistance <= maxDetourMeters;

  // Pickup must happen before or at the same position as drop along the driver route
  const isChronologicallyValid = pickupRouteProgress <= dropRouteProgress;

  return {
    nearestPickupDistanceMeters: minPickupDistance,
    nearestDropDistanceMeters: minDropDistance,
    totalDetourMeters: minPickupDistance + minDropDistance,
    maxAllowedDetourMeters: maxDetourMeters,
    isWithinDetourLimit,
    isChronologicallyValid,
    nearestPickupStopOrder,
    nearestDropStopOrder,
    pickupRouteProgress,
    dropRouteProgress,
  };
}
