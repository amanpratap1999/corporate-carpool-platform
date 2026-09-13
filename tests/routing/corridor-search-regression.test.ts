import { describe, it, expect } from 'vitest';
import {
  calculateHaversineDistanceMeters,
  projectPointToSegment,
  evaluatePassengerDetour,
  type RouteSegmentWaypoint,
} from '../../src/domain/routing/detour-calculator';

describe('Corridor Search Numeric Normalization & Regression', () => {
  const driverWaypoints = [
    { stop_order: '0', latitude: '26.8500', longitude: '75.7800' },
    { stop_order: '1', latitude: '26.9000', longitude: '75.8000' },
    { stop_order: '2', latitude: '26.9500', longitude: '75.8200' },
  ] as unknown as RouteSegmentWaypoint[];

  it('calculateHaversineDistanceMeters handles string inputs without NaN or string concatenation', () => {
    // String inputs (e.g., from Postgres numeric columns)
    const dist = calculateHaversineDistanceMeters(
      '26.8500' as any,
      '75.7800' as any,
      '26.9500' as any,
      '75.8200' as any
    );
    expect(Number.isFinite(dist)).toBe(true);
    expect(isNaN(dist)).toBe(false);
    expect(dist).toBeGreaterThan(10000);
    expect(dist).toBeLessThan(20000);
  });

  it('calculateHaversineDistanceMeters returns Infinity safely for invalid/NaN inputs', () => {
    const dist = calculateHaversineDistanceMeters('invalid' as any, 75.78, 26.95, 75.82);
    expect(dist).toBe(Infinity);
  });

  it('projectPointToSegment correctly handles string coordinates in segment projection', () => {
    const p = { latitude: '26.8900' as any, longitude: '75.7950' as any };
    const a = { latitude: '26.8500' as any, longitude: '75.7800' as any };
    const b = { latitude: '26.9500' as any, longitude: '75.8200' as any };

    const result = projectPointToSegment(p, a, b);
    expect(Number.isFinite(result.distanceMeters)).toBe(true);
    expect(isNaN(result.distanceMeters)).toBe(false);
    expect(result.t).toBeGreaterThan(0);
    expect(result.t).toBeLessThan(1);
  });

  it('evaluatePassengerDetour successfully evaluates waypoints with string numeric properties', () => {
    const passengerPickup = { latitude: '26.8600' as any, longitude: '75.7850' as any };
    const passengerDrop = { latitude: '26.9400' as any, longitude: '75.8150' as any };

    const evaluation = evaluatePassengerDetour(
      driverWaypoints,
      passengerPickup,
      passengerDrop,
      3000
    );

    expect(Number.isFinite(evaluation.nearestPickupDistanceMeters)).toBe(true);
    expect(Number.isFinite(evaluation.nearestDropDistanceMeters)).toBe(true);
    expect(Number.isFinite(evaluation.totalDetourMeters)).toBe(true);
    expect(isNaN(evaluation.totalDetourMeters)).toBe(false);
    expect(evaluation.isWithinDetourLimit).toBe(true);
    expect(evaluation.isChronologicallyValid).toBe(true);
    expect(evaluation.pickupRouteProgress).toBeLessThan(evaluation.dropRouteProgress!);
  });

  it('evaluatePassengerDetour rejects reverse direction with string coordinates', () => {
    // Passenger traveling opposite direction
    const passengerPickup = { latitude: '26.9400' as any, longitude: '75.8150' as any };
    const passengerDrop = { latitude: '26.8600' as any, longitude: '75.7850' as any };

    const evaluation = evaluatePassengerDetour(
      driverWaypoints,
      passengerPickup,
      passengerDrop,
      3000
    );

    expect(evaluation.isChronologicallyValid).toBe(false);
  });
});
