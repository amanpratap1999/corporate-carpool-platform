import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';
import {
  LatLngPoint,
  RoutePreferences,
  DirectionsRequestBody,
  DirectionsRouteOption,
  decodePolyline,
} from '@/domain/types';

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}

function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 60) {
    return `${mins} mins`;
  }
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  return remainingMins > 0 ? `${hours} hr ${remainingMins} min` : `${hours} hr`;
}

function extractMajorRoads(text: string, existingList: string[]): void {
  const regex = /\b(I-\d+|US-\d+|Hwy\s*\d+|Highway\s*\d+|Route\s*\d+|SR\s*\d+|State\s*Route\s*\d+|Expressway|Turnpike|Parkway|Bypass|Boulevard|Blvd|Ave|Avenue|Rd|Road)\b/gi;
  const matches = text.match(regex);
  if (matches) {
    for (const m of matches) {
      const clean = m.trim();
      if (!existingList.includes(clean)) {
        existingList.push(clean);
      }
    }
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth.response;
  }

  let body: DirectionsRequestBody;
  try {
    body = await req.json();
  } catch {
    return problemResponse(400, 'Bad Request', 'Invalid JSON body', 'ERR_INVALID_BODY', req.nextUrl.pathname);
  }

  const { origin, destination, waypoints: intermediateWaypoints = [], alternatives = true, preferences } = body;

  if (
    !origin || !destination ||
    origin.lat === undefined || origin.lng === undefined ||
    destination.lat === undefined || destination.lng === undefined
  ) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'origin and destination coordinates (lat, lng) are required.',
      'ERR_MISSING_COORDINATES',
      req.nextUrl.pathname
    );
  }

  // Coordinate range validation
  if (
    typeof origin.lat !== 'number' || origin.lat < -90 || origin.lat > 90 ||
    typeof origin.lng !== 'number' || origin.lng < -180 || origin.lng > 180 ||
    typeof destination.lat !== 'number' || destination.lat < -90 || destination.lat > 90 ||
    typeof destination.lng !== 'number' || destination.lng < -180 || destination.lng > 180
  ) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'origin and destination coordinates must be valid latitude (-90 to 90) and longitude (-180 to 180) values.',
      'ERR_INVALID_COORDINATES',
      req.nextUrl.pathname
    );
  }

  // Validate intermediate waypoints
  if (!Array.isArray(intermediateWaypoints)) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'waypoints must be an array of points.',
      'ERR_INVALID_WAYPOINTS',
      req.nextUrl.pathname
    );
  }

  if (intermediateWaypoints.length > 8) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'A maximum of 8 intermediate stops can be added to a route.',
      'ERR_TOO_MANY_WAYPOINTS',
      req.nextUrl.pathname
    );
  }

  for (let i = 0; i < intermediateWaypoints.length; i++) {
    const wp = intermediateWaypoints[i];
    if (
      typeof wp.lat !== 'number' || wp.lat < -90 || wp.lat > 90 ||
      typeof wp.lng !== 'number' || wp.lng < -180 || wp.lng > 180
    ) {
      return problemResponse(
        422,
        'Unprocessable Entity',
        `Waypoint at index ${i} has invalid coordinates.`,
        'ERR_INVALID_WAYPOINT_COORDINATES',
        req.nextUrl.pathname
      );
    }
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_DIRECTIONS_API_KEY;

  if (!apiKey) {
    return problemResponse(
      503,
      'Service Unavailable',
      'Google Maps API key is not configured. Set GOOGLE_MAPS_API_KEY in environment variables.',
      'ERR_GOOGLE_MAPS_NOT_CONFIGURED',
      req.nextUrl.pathname
    );
  }

  try {
    // 1. Try modern Google Routes API v2
    const intermediates = intermediateWaypoints.map((w) => ({
      location: {
        latLng: { latitude: w.lat, longitude: w.lng },
      },
    }));

    const routeModifiers: Record<string, boolean> = {};
    if (preferences?.avoid_tolls) routeModifiers.avoidTolls = true;
    if (preferences?.avoid_highways) routeModifiers.avoidHighways = true;
    if (preferences?.avoid_ferries) routeModifiers.avoidFerries = true;

    const routesV2Payload: Record<string, unknown> = {
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: 'DRIVE',
      routingPreference: preferences?.routing_preference === 'SHORTER' ? 'TRAFFIC_UNAWARE' : 'TRAFFIC_AWARE',
      computeAlternativeRoutes: intermediates.length === 0 && alternatives !== false,
    };

    if (intermediates.length > 0) {
      routesV2Payload.intermediates = intermediates;
    }
    if (Object.keys(routeModifiers).length > 0) {
      routesV2Payload.routeModifiers = routeModifiers;
    }

    const routesRes = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask':
          'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.description,routes.legs,routes.warnings,routes.travelAdvisory',
      },
      body: JSON.stringify(routesV2Payload),
    });

    if (routesRes.ok) {
      const data = await routesRes.json();
      if (data.routes && data.routes.length > 0) {
        const routes: DirectionsRouteOption[] = data.routes.map((r: any, idx: number) => {
          const durationSec = parseInt(r.duration?.replace('s', '') || '0', 10);
          const distanceMeters = r.distanceMeters || 0;
          const polyline = r.polyline?.encodedPolyline || '';
          const path = polyline ? decodePolyline(polyline) : [];
          const summary = r.description || (idx === 0 ? 'Fastest Route' : `Alternative ${idx}`);

          // Extract warnings & toll info
          const warnings: string[] = Array.isArray(r.warnings) ? r.warnings : [];
          const hasTolls = Boolean(
            r.travelAdvisory?.tollInfo ||
            warnings.some((w: string) => w.toLowerCase().includes('toll')) ||
            preferences?.avoid_tolls === false
          );
          const hasFerries = Boolean(
            warnings.some((w: string) => w.toLowerCase().includes('ferry'))
          );
          const hasHighways = Boolean(
            summary.toLowerCase().includes('hwy') ||
            summary.toLowerCase().includes('i-') ||
            summary.toLowerCase().includes('highway') ||
            summary.toLowerCase().includes('fwy')
          );
          const hasRestrictedRoads = Boolean(
            warnings.some((w: string) => w.toLowerCase().includes('restricted') || w.toLowerCase().includes('private'))
          );

          const majorRoadNames: string[] = [];
          extractMajorRoads(summary, majorRoadNames);

          const legDetails: DirectionsRouteOption['leg_details'] = [];
          const routeWaypoints: DirectionsRouteOption['waypoints'] = [
            {
              stop_order: 0,
              point_type: 'ORIGIN',
              address_text: origin.address || 'Origin',
              latitude: origin.lat,
              longitude: origin.lng,
              place_id: origin.place_id,
              estimated_arrival_offset_seconds: 0,
            },
          ];

          let accumulatedOffset = 0;
          if (Array.isArray(r.legs)) {
            r.legs.forEach((leg: any, legIdx: number) => {
              const legDist = leg.distanceMeters || 0;
              const legDur = parseInt(leg.duration?.replace('s', '') || '0', 10);
              accumulatedOffset += legDur;

              legDetails.push({
                distance_meters: legDist,
                duration_seconds: legDur,
                start_address: legIdx === 0 ? (origin.address || 'Origin') : (intermediateWaypoints[legIdx - 1]?.address || `Stop ${legIdx}`),
                end_address: legIdx === r.legs.length - 1 ? (destination.address || 'Destination') : (intermediateWaypoints[legIdx]?.address || `Stop ${legIdx + 1}`),
              });

              if (legIdx < intermediateWaypoints.length) {
                const wp = intermediateWaypoints[legIdx];
                routeWaypoints.push({
                  stop_order: routeWaypoints.length,
                  point_type: 'CORRIDOR',
                  address_text: wp.address || `Stop ${legIdx + 1}`,
                  latitude: wp.lat,
                  longitude: wp.lng,
                  place_id: wp.place_id,
                  estimated_arrival_offset_seconds: accumulatedOffset,
                });
              }
            });
          }

          // Add final destination
          routeWaypoints.push({
            stop_order: routeWaypoints.length,
            point_type: 'DESTINATION',
            address_text: destination.address || 'Destination',
            latitude: destination.lat,
            longitude: destination.lng,
            place_id: destination.place_id,
            estimated_arrival_offset_seconds: durationSec,
          });

          return {
            route_id: `groute_${idx}_${Date.now()}`,
            summary,
            distance: distanceMeters,
            total_distance_meters: distanceMeters,
            duration: durationSec,
            total_duration_seconds: durationSec,
            formatted_distance: formatDistance(distanceMeters),
            formatted_duration: formatDuration(durationSec),
            encoded_polyline: polyline,
            path,
            is_recommended: idx === 0,
            warnings,
            toll_metadata: {
              has_tolls: hasTolls,
              toll_details: hasTolls ? 'This route involves toll roads.' : undefined,
            },
            has_ferries: hasFerries,
            has_highways: hasHighways,
            has_restricted_roads: hasRestrictedRoads,
            major_road_names: majorRoadNames,
            leg_details: legDetails,
            waypoints: routeWaypoints,
          };
        });

        return NextResponse.json({ routes });
      }
    }

    // 2. Fallback to legacy Google Maps Directions API
    const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
    url.searchParams.set('origin', `${origin.lat},${origin.lng}`);
    url.searchParams.set('destination', `${destination.lat},${destination.lng}`);
    url.searchParams.set('alternatives', alternatives ? 'true' : 'false');
    url.searchParams.set('departure_time', 'now');
    url.searchParams.set('key', apiKey);

    if (intermediateWaypoints.length > 0) {
      const wpParam = intermediateWaypoints
        .map((w) => (w.place_id ? `place_id:${w.place_id}` : `${w.lat},${w.lng}`))
        .join('|');
      url.searchParams.set('waypoints', wpParam);
    }

    const avoids: string[] = [];
    if (preferences?.avoid_tolls) avoids.push('tolls');
    if (preferences?.avoid_highways) avoids.push('highways');
    if (preferences?.avoid_ferries) avoids.push('ferries');
    if (avoids.length > 0) {
      url.searchParams.set('avoid', avoids.join('|'));
    }

    const googleRes = await fetch(url.toString());
    if (!googleRes.ok) {
      return problemResponse(
        502,
        'Bad Gateway',
        `Google Maps API HTTP error: ${googleRes.status}`,
        'ERR_GOOGLE_MAPS_UPSTREAM_ERROR',
        req.nextUrl.pathname
      );
    }

    const googleData = await googleRes.json();
    if (googleData.status !== 'OK' || !googleData.routes?.length) {
      return problemResponse(
        502,
        'Bad Gateway',
        `Google Maps Directions API returned status: ${googleData.status || 'unknown'}. ${googleData.error_message || ''}`,
        'ERR_GOOGLE_MAPS_NO_ROUTES',
        req.nextUrl.pathname
      );
    }

    const routes: DirectionsRouteOption[] = googleData.routes.map((r: any, idx: number) => {
      let totalDistMeters = 0;
      let totalDurSeconds = 0;
      let totalTrafficDuration: number | undefined = undefined;
      const legDetails: DirectionsRouteOption['leg_details'] = [];
      const majorRoads: string[] = [];

      extractMajorRoads(r.summary || '', majorRoads);

      (r.legs || []).forEach((leg: any) => {
        const dM = leg.distance?.value || 0;
        const dS = leg.duration?.value || 0;
        totalDistMeters += dM;
        totalDurSeconds += dS;

        if (leg.duration_in_traffic?.value) {
          totalTrafficDuration = (totalTrafficDuration || 0) + leg.duration_in_traffic.value;
        }

        legDetails.push({
          distance_meters: dM,
          duration_seconds: dS,
          start_address: leg.start_address,
          end_address: leg.end_address,
        });

        (leg.steps || []).forEach((s: any) => {
          if (s.html_instructions) {
            extractMajorRoads(s.html_instructions.replace(/<[^>]*>/g, ''), majorRoads);
          }
        });
      });

      const warnings: string[] = Array.isArray(r.warnings) ? r.warnings : [];
      const hasTolls = Boolean(
        warnings.some((w: string) => w.toLowerCase().includes('toll')) ||
        r.legs.some((l: any) => (l.steps || []).some((s: any) => s.html_instructions?.toLowerCase().includes('toll')))
      );
      const hasFerries = Boolean(
        warnings.some((w: string) => w.toLowerCase().includes('ferry')) ||
        r.legs.some((l: any) => (l.steps || []).some((s: any) => s.html_instructions?.toLowerCase().includes('ferry')))
      );
      const hasHighways = Boolean(
        (r.summary || '').toLowerCase().includes('hwy') ||
        (r.summary || '').toLowerCase().includes('i-') ||
        (r.summary || '').toLowerCase().includes('us-') ||
        (r.summary || '').toLowerCase().includes('highway')
      );
      const hasRestrictedRoads = Boolean(
        warnings.some((w: string) => w.toLowerCase().includes('restricted') || w.toLowerCase().includes('private'))
      );

      const polyline = r.overview_polyline?.points || '';
      const path = polyline ? decodePolyline(polyline) : [];

      const routeWaypoints: DirectionsRouteOption['waypoints'] = [
        {
          stop_order: 0,
          point_type: 'ORIGIN',
          address_text: origin.address || r.legs[0]?.start_address || 'Origin',
          latitude: origin.lat,
          longitude: origin.lng,
          place_id: origin.place_id,
          estimated_arrival_offset_seconds: 0,
        },
      ];

      // If user provided intermediate waypoints, map them to leg transitions
      let cumOffset = 0;
      for (let legIdx = 0; legIdx < (r.legs || []).length; legIdx++) {
        const leg = r.legs[legIdx];
        cumOffset += leg.duration?.value || 0;

        if (legIdx < intermediateWaypoints.length) {
          const wp = intermediateWaypoints[legIdx];
          routeWaypoints.push({
            stop_order: routeWaypoints.length,
            point_type: 'CORRIDOR',
            address_text: wp.address || leg.end_address || `Stop ${legIdx + 1}`,
            latitude: wp.lat,
            longitude: wp.lng,
            place_id: wp.place_id,
            estimated_arrival_offset_seconds: cumOffset,
          });
        }
      }

      // If no custom intermediate waypoints were given, sample key corridor points from steps for visual fidelity
      if (intermediateWaypoints.length === 0 && r.legs[0]?.steps?.length > 4) {
        const leg = r.legs[0];
        let stepOffset = 0;
        (leg.steps || []).forEach((step: any, stepIdx: number) => {
          stepOffset += step.duration?.value || 60;
          if (stepIdx % 4 === 0 && stepIdx > 0 && stepIdx < leg.steps.length - 1) {
            routeWaypoints.push({
              stop_order: routeWaypoints.length,
              point_type: 'CORRIDOR',
              address_text: step.html_instructions?.replace(/<[^>]*>/g, '') || `Corridor ${routeWaypoints.length}`,
              latitude: step.end_location.lat,
              longitude: step.end_location.lng,
              estimated_arrival_offset_seconds: stepOffset,
            });
          }
        });
      }

      // Final destination waypoint
      routeWaypoints.push({
        stop_order: routeWaypoints.length,
        point_type: 'DESTINATION',
        address_text: destination.address || r.legs[r.legs.length - 1]?.end_address || 'Destination',
        latitude: destination.lat,
        longitude: destination.lng,
        place_id: destination.place_id,
        estimated_arrival_offset_seconds: totalDurSeconds,
      });

      return {
        route_id: `groute_${idx}_${Date.now()}`,
        summary: r.summary || (idx === 0 ? 'Fastest Route' : `Alternative Route ${idx}`),
        distance: totalDistMeters,
        total_distance_meters: totalDistMeters,
        duration: totalDurSeconds,
        total_duration_seconds: totalDurSeconds,
        formatted_distance: formatDistance(totalDistMeters),
        formatted_duration: formatDuration(totalDurSeconds),
        duration_in_traffic: totalTrafficDuration,
        formatted_traffic_duration: totalTrafficDuration ? formatDuration(totalTrafficDuration) : undefined,
        encoded_polyline: polyline,
        path,
        is_recommended: idx === 0,
        warnings,
        toll_metadata: {
          has_tolls: hasTolls,
          toll_details: hasTolls ? 'This route involves toll roads.' : undefined,
        },
        has_ferries: hasFerries,
        has_highways: hasHighways,
        has_restricted_roads: hasRestrictedRoads,
        major_road_names: majorRoads.slice(0, 5),
        leg_details: legDetails,
        waypoints: routeWaypoints,
      };
    });

    return NextResponse.json({ routes });
  } catch (err) {
    console.error('Google Directions API call failed:', err);
    return problemResponse(
      502,
      'Bad Gateway',
      'Failed to contact Google Maps Directions API.',
      'ERR_GOOGLE_MAPS_UPSTREAM_ERROR',
      req.nextUrl.pathname
    );
  }
}
