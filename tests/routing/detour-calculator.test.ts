import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistanceMeters,
  distanceToSegmentMeters,
  evaluatePassengerDetour,
  RouteSegmentWaypoint,
  Coordinate,
} from '@/domain/routing/detour-calculator';

describe('Authoritative Driver Route Invariants & Detour Calculator', () => {
  const driverRouteWaypoints: RouteSegmentWaypoint[] = [
    {
      stop_order: 0,
      latitude: 37.7615,
      longitude: -122.426,
      address_text: '450 Dolores St, San Francisco, CA (Origin)',
    },
    {
      stop_order: 1,
      latitude: 37.5997,
      longitude: -122.3867,
      address_text: 'Millbrae BART Station (Waypoint 1)',
    },
    {
      stop_order: 2,
      latitude: 37.563,
      longitude: -122.3255,
      address_text: 'San Mateo Transit Hub (Waypoint 2)',
    },
    {
      stop_order: 3,
      latitude: 37.422,
      longitude: -122.0841,
      address_text: '1600 Amphitheatre Pkwy, Mountain View, CA (Destination)',
    },
  ];

  describe('calculateHaversineDistanceMeters', () => {
    it('returns 0 when coordinates are identical', () => {
      const dist = calculateHaversineDistanceMeters(37.7615, -122.426, 37.7615, -122.426);
      expect(dist).toBe(0);
    });

    it('calculates geodesic distance accurately across SF Bay corridor', () => {
      // Distance between SF Mission and Mountain View HQ is ~48km to 51km geodesic
      const dist = calculateHaversineDistanceMeters(37.7615, -122.426, 37.422, -122.0841);
      expect(dist).toBeGreaterThan(47000);
      expect(dist).toBeLessThan(52000);
    });
  });

  describe('distanceToSegmentMeters', () => {
    const pointA: Coordinate = { latitude: 37.5, longitude: -122.2 };
    const pointB: Coordinate = { latitude: 37.5, longitude: -122.0 };

    it('returns approximately 0 for a point lying on the segment', () => {
      const pointOnLine: Coordinate = { latitude: 37.5, longitude: -122.1 };
      const dist = distanceToSegmentMeters(pointOnLine, pointA, pointB);
      expect(dist).toBeLessThan(10); // Less than 10 meters tolerance
    });

    it('returns perpendicular distance for an offset point', () => {
      // 0.01 degrees of latitude is ~1111 meters
      const offsetPoint: Coordinate = { latitude: 37.51, longitude: -122.1 };
      const dist = distanceToSegmentMeters(offsetPoint, pointA, pointB);
      expect(dist).toBeGreaterThan(1000);
      expect(dist).toBeLessThan(1200);
    });

    it('clamps to endpoint when projected point falls outside segment', () => {
      const pastEndPoint: Coordinate = { latitude: 37.5, longitude: -121.9 };
      const dist = distanceToSegmentMeters(pastEndPoint, pointA, pointB);
      const directDist = calculateHaversineDistanceMeters(
        pastEndPoint.latitude,
        pastEndPoint.longitude,
        pointB.latitude,
        pointB.longitude
      );
      expect(dist).toBe(directDist);
    });
  });

  describe('evaluatePassengerDetour', () => {
    it('approves boarding for commuter directly along driver corridor', () => {
      // Commuter boarding at Millbrae BART and dropping at Mountain View HQ
      const pickup: Coordinate = { latitude: 37.5997, longitude: -122.3867 };
      const drop: Coordinate = { latitude: 37.422, longitude: -122.0841 };

      const result = evaluatePassengerDetour(driverRouteWaypoints, pickup, drop, 3000);

      expect(result.isWithinDetourLimit).toBe(true);
      expect(result.isChronologicallyValid).toBe(true);
      expect(result.nearestPickupDistanceMeters).toBeLessThan(100);
      expect(result.nearestDropDistanceMeters).toBeLessThan(100);
      expect(result.totalDetourMeters).toBeLessThan(200);
      expect(result.nearestPickupStopOrder).toBeLessThanOrEqual(result.nearestDropStopOrder);
    });

    it('rejects boarding when pickup exceeds maximum detour threshold', () => {
      // Commuter requesting pickup in Oakland (across the bay, > 20km away)
      const distantPickup: Coordinate = { latitude: 37.8044, longitude: -122.2712 };
      const drop: Coordinate = { latitude: 37.422, longitude: -122.0841 };

      const result = evaluatePassengerDetour(driverRouteWaypoints, distantPickup, drop, 3000);

      expect(result.isWithinDetourLimit).toBe(false);
      expect(result.nearestPickupDistanceMeters).toBeGreaterThan(10000);
    });

    it('detects chronologically invalid ride requests (reverse-direction passenger)', () => {
      // Driver travels South (SF -> Mountain View).
      // Passenger requests pickup in Mountain View (stop 3) and drop in Millbrae (stop 1).
      const invalidPickup: Coordinate = { latitude: 37.422, longitude: -122.0841 };
      const invalidDrop: Coordinate = { latitude: 37.5997, longitude: -122.3867 };

      const result = evaluatePassengerDetour(driverRouteWaypoints, invalidPickup, invalidDrop, 3000);

      expect(result.isWithinDetourLimit).toBe(true); // points are physically close to highway
      expect(result.isChronologicallyValid).toBe(false); // but reverse order!
      expect(result.nearestPickupStopOrder).toBeGreaterThan(result.nearestDropStopOrder);
    });

    it('preserves the Authoritative Driver Route Invariant: driver waypoints are never mutated', () => {
      const originalWaypointsSnapshot = JSON.parse(JSON.stringify(driverRouteWaypoints));

      const pickup: Coordinate = { latitude: 37.58, longitude: -122.34 };
      const drop: Coordinate = { latitude: 37.45, longitude: -122.12 };

      // Run detour evaluation
      evaluatePassengerDetour(driverRouteWaypoints, pickup, drop, 3000);

      // Verify original driver route waypoints are 100% unaltered
      expect(driverRouteWaypoints).toEqual(originalWaypointsSnapshot);
      expect(driverRouteWaypoints.length).toBe(4);
      expect(driverRouteWaypoints[0].address_text).toBe(originalWaypointsSnapshot[0].address_text);
    });

    it('handles numeric string coordinates gracefully without producing NaN or string concatenation', () => {
      const stringWaypoints = [
        {
          stop_order: '0' as any,
          latitude: '26.9124' as any,
          longitude: '75.7873' as any,
          address_text: 'Jaipur Origin',
        },
        {
          stop_order: '1' as any,
          latitude: '26.8500' as any,
          longitude: '75.8000' as any,
          address_text: 'Jaipur Destination',
        },
      ];
      const pickup: Coordinate = { latitude: '26.9124' as any, longitude: '75.7873' as any };
      const drop: Coordinate = { latitude: '26.8500' as any, longitude: '75.8000' as any };

      const result = evaluatePassengerDetour(stringWaypoints, pickup, drop, 3000);
      expect(result.isWithinDetourLimit).toBe(true);
      expect(result.isChronologicallyValid).toBe(true);
      expect(Number.isNaN(result.nearestPickupDistanceMeters)).toBe(false);
      expect(Number.isFinite(result.nearestPickupDistanceMeters)).toBe(true);
      expect(result.nearestPickupDistanceMeters).toBeLessThan(50);
    });

    it('throws when driver route has fewer than 2 waypoints', () => {
      expect(() => {
        evaluatePassengerDetour(
          [driverRouteWaypoints[0]],
          { latitude: 37.5, longitude: -122.2 },
          { latitude: 37.4, longitude: -122.1 }
        );
      }).toThrow('Driver route must contain at least 2 waypoints');
    });
  });
});
