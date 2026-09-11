'use client';

import React, { useEffect, useRef, useState } from 'react';
import { setOptions, importLibrary } from '@googlemaps/js-api-loader';
import { RouteWaypoint, RideRoute, DirectionsRouteOption, decodePolyline } from '@/domain/types';

interface GoogleMapViewerProps {
  route?: Partial<RideRoute>;
  routes?: DirectionsRouteOption[];
  origin?: { latitude?: number; longitude?: number; address?: string };
  destination?: { latitude?: number; longitude?: number; address?: string };
  selectedRouteId?: string;
  selectedRouteIdx?: number;
  onSelectRoute?: (routeId: string, idx: number) => void;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  waypoints?: Array<Partial<RouteWaypoint> & { latitude: number; longitude: number; stop_order: number; address_text?: string; point_type?: string }>;
  pickupPoint?: { latitude: number; longitude: number; address?: string };
  dropPoint?: { latitude: number; longitude: number; address?: string };
  routePolyline?: string;
  height?: string;
  className?: string;
  showTraffic?: boolean;
}

export const GoogleMapViewer: React.FC<GoogleMapViewerProps> = ({
  route,
  routes = [],
  origin,
  destination,
  selectedRouteId,
  selectedRouteIdx = 0,
  onSelectRoute,
  onMapClick,
  waypoints = [],
  pickupPoint,
  dropPoint,
  routePolyline,
  height = '240px',
  className = '',
  showTraffic = false,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const [googleMapLoaded, setGoogleMapLoaded] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const googleMapInstanceRef = useRef<any>(null);
  const mapOverlaysRef = useRef<any[]>([]);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  // Initialize and update Google Maps JavaScript SDK when API key is available
  useEffect(() => {
    if (!apiKey) {
      // Graceful fallback to SVG canvas when no API key is present
      return;
    }

    let isMounted = true;

    setOptions({
      key: apiKey,
      v: 'weekly',
    });

    Promise.all([
      importLibrary('maps'),
      importLibrary('geometry'),
      importLibrary('marker'),
    ])
      .then(() => {
        if (!isMounted || !mapContainerRef.current) return;
        const google = (window as any).google;
        if (!google?.maps) return;

        // Clean up previous overlays (polylines, markers)
        mapOverlaysRef.current.forEach((obj) => {
          if (obj.setMap) obj.setMap(null);
        });
        mapOverlaysRef.current = [];

        // Create or reuse map instance
        let map = googleMapInstanceRef.current;
        if (!map) {
          const defaultCenter = {
            lat: route?.origin_latitude || 37.566,
            lng: route?.origin_longitude || -122.325,
          };

          map = new google.maps.Map(mapContainerRef.current, {
            center: defaultCenter,
            zoom: 11,
            mapTypeId: 'roadmap',
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            styles: [
              { elementType: 'geometry', stylers: [{ color: '#0f172a' }] },
              { elementType: 'labels.text.stroke', stylers: [{ color: '#0f172a' }] },
              { elementType: 'labels.text.fill', stylers: [{ color: '#94a3b8' }] },
              {
                featureType: 'road',
                elementType: 'geometry',
                stylers: [{ color: '#1e293b' }],
              },
              {
                featureType: 'road.highway',
                elementType: 'geometry',
                stylers: [{ color: '#334155' }],
              },
              {
                featureType: 'road.highway',
                elementType: 'geometry.stroke',
                stylers: [{ color: '#0284c7' }],
              },
              {
                featureType: 'water',
                elementType: 'geometry',
                stylers: [{ color: '#020617' }],
              },
            ],
          });

          googleMapInstanceRef.current = map;
          setGoogleMapLoaded(true);
        }

        // Map Click Listener
        if (onMapClick) {
          const clickListener = map.addListener('click', (e: any) => {
            if (e.latLng) {
              onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
            }
          });
          mapOverlaysRef.current.push({ setMap: () => google.maps.event.removeListener(clickListener) });
        }

        const bounds = new google.maps.LatLngBounds();

        // 1. Draw Route Polylines (support multiple alternatives simultaneously)
        const effectiveRoutes: Array<{
          id: string;
          polyline?: string;
          path?: Array<{ lat: number; lng: number }>;
          isSelected: boolean;
          idx: number;
        }> = [];

        if (routes && routes.length > 0) {
          routes.forEach((r, idx) => {
            const isSelected =
              (selectedRouteId && r.route_id === selectedRouteId) ||
              (selectedRouteIdx !== undefined && idx === selectedRouteIdx) ||
              (routes.length === 1);
            effectiveRoutes.push({
              id: r.route_id || `route_${idx}`,
              polyline: r.encoded_polyline,
              path: r.path,
              isSelected,
              idx,
            });
          });
        } else if (routePolyline || route?.encoded_polyline) {
          effectiveRoutes.push({
            id: 'single_route',
            polyline: routePolyline || route?.encoded_polyline,
            isSelected: true,
            idx: 0,
          });
        }

        // Render unselected routes first, then selected route on top
        const sortedRoutesToDraw = [...effectiveRoutes].sort((a, b) => (a.isSelected ? 1 : 0) - (b.isSelected ? 1 : 0));

        sortedRoutesToDraw.forEach((r) => {
          let pathCoords: Array<{ lat: number; lng: number }> = [];

          if (r.path && r.path.length > 0) {
            pathCoords = r.path;
          } else if (r.polyline) {
            pathCoords = decodePolyline(r.polyline);
          }

          if (pathCoords.length > 1) {
            pathCoords.forEach((p) => {
              if (r.isSelected) {
                bounds.extend(p);
              }
            });

            const polylineObj = new google.maps.Polyline({
              path: pathCoords,
              geodesic: true,
              strokeColor: r.isSelected ? '#2563eb' : '#64748b',
              strokeOpacity: r.isSelected ? 0.95 : 0.6,
              strokeWeight: r.isSelected ? 6 : 4,
              zIndex: r.isSelected ? 100 : 10,
              map,
            });

            // Click polyline to select route
            polylineObj.addListener('click', () => {
              if (onSelectRoute) {
                onSelectRoute(r.id, r.idx);
              }
            });

            // Mouse hover cursor
            polylineObj.addListener('mouseover', () => {
              map.setOptions({ draggableCursor: 'pointer' });
              if (!r.isSelected) {
                polylineObj.setOptions({ strokeOpacity: 0.85, strokeWeight: 5 });
              }
            });
            polylineObj.addListener('mouseout', () => {
              map.setOptions({ draggableCursor: '' });
              if (!r.isSelected) {
                polylineObj.setOptions({ strokeOpacity: 0.6, strokeWeight: 4 });
              }
            });

            mapOverlaysRef.current.push(polylineObj);
          }
        });

        // 2. Plot Waypoint Pins
        const sortedWaypoints = [...waypoints].sort((a, b) => a.stop_order - b.stop_order);

        sortedWaypoints.forEach((wp, idx) => {
          const pos = { lat: wp.latitude, lng: wp.longitude };
          bounds.extend(pos);

          const isOrigin = wp.point_type === 'ORIGIN' || idx === 0;
          const isDest = wp.point_type === 'DESTINATION' || idx === sortedWaypoints.length - 1;
          const isStop = !isOrigin && !isDest;

          const marker = new google.maps.Marker({
            position: pos,
            map,
            title: wp.address_text || (isOrigin ? 'Origin' : isDest ? 'Destination' : `Stop ${wp.stop_order || idx}`),
            label: isOrigin
              ? { text: 'A', color: '#ffffff', fontWeight: 'bold' }
              : isDest
              ? { text: 'B', color: '#ffffff', fontWeight: 'bold' }
              : { text: String(wp.stop_order || idx), color: '#ffffff', fontSize: '11px', fontWeight: 'bold' },
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: isOrigin || isDest ? 9 : 7,
              fillColor: isOrigin ? '#10b981' : isDest ? '#ef4444' : '#0ea5e9',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
            zIndex: isOrigin || isDest ? 200 : 150,
          });

          mapOverlaysRef.current.push(marker);
        });

        // 3. Passenger pickup pin
        if (pickupPoint) {
          const pickupPos = { lat: pickupPoint.latitude, lng: pickupPoint.longitude };
          bounds.extend(pickupPos);
          const pickupMarker = new google.maps.Marker({
            position: pickupPos,
            map,
            title: pickupPoint.address || 'Passenger Pickup Point',
            icon: {
              path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
              scale: 6,
              fillColor: '#f59e0b',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
            zIndex: 180,
          });
          mapOverlaysRef.current.push(pickupMarker);
        }

        // 4. Passenger drop pin
        if (dropPoint) {
          const dropPos = { lat: dropPoint.latitude, lng: dropPoint.longitude };
          bounds.extend(dropPos);
          const dropMarker = new google.maps.Marker({
            position: dropPos,
            map,
            title: dropPoint.address || 'Passenger Dropoff Point',
            icon: {
              path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
              scale: 6,
              fillColor: '#a855f7',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            },
            zIndex: 180,
          });
          mapOverlaysRef.current.push(dropMarker);
        }

        // 5. Adjust bounds
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, 35);
        }

        if (showTraffic) {
          const trafficLayer = new google.maps.TrafficLayer();
          trafficLayer.setMap(map);
          mapOverlaysRef.current.push(trafficLayer);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setLoadError(err.message || 'Failed to load Google Maps SDK');
          setGoogleMapLoaded(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [apiKey, route, routes, selectedRouteId, selectedRouteIdx, waypoints, pickupPoint, dropPoint, showTraffic]);

  // If live Google Maps is active and rendered, display the map container
  if (apiKey && !loadError) {
    return (
      <div className={`relative rounded-xl overflow-hidden border border-slate-800 bg-slate-950 ${className}`}>
        <div ref={mapContainerRef} style={{ width: '100%', height }} />
        <div className="absolute top-2 right-2 bg-slate-900/90 backdrop-blur-sm border border-emerald-500/40 text-emerald-400 text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span>Google Maps Active</span>
        </div>
      </div>
    );
  }

  // Local development SVG fallback — clearly labeled as a dev-only visualization
  if (!apiKey && process.env.NEXT_PUBLIC_DEMO_MODE !== 'true') {
    return (
      <div
        className={`relative rounded-xl overflow-hidden border border-amber-700/40 bg-amber-950/20 ${className} flex items-center justify-center`}
        style={{ height }}
      >
        <div className="text-center p-6">
          <div className="w-10 h-10 rounded-full bg-amber-900/40 border border-amber-600/40 flex items-center justify-center mx-auto mb-3">
            <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
          </div>
          <p className="text-amber-300 text-sm font-semibold">Map Unavailable</p>
          <p className="text-amber-500/80 text-xs mt-1">
            NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured.
          </p>
        </div>
      </div>
    );
  }

  // Collect all coordinates for SVG bounding box
  const allCoords: Array<{ lat: number; lng: number }> = [];
  waypoints.forEach((w) => allCoords.push({ lat: w.latitude, lng: w.longitude }));
  if (pickupPoint) allCoords.push({ lat: pickupPoint.latitude, lng: pickupPoint.longitude });
  if (dropPoint) allCoords.push({ lat: dropPoint.latitude, lng: dropPoint.longitude });
  if (origin?.latitude && origin?.longitude) {
    allCoords.push({ lat: origin.latitude, lng: origin.longitude });
  }
  if (destination?.latitude && destination?.longitude) {
    allCoords.push({ lat: destination.latitude, lng: destination.longitude });
  }
  if (route?.origin_latitude && route?.origin_longitude) {
    allCoords.push({ lat: route.origin_latitude, lng: route.origin_longitude });
  }
  if (route?.destination_latitude && route?.destination_longitude) {
    allCoords.push({ lat: route.destination_latitude, lng: route.destination_longitude });
  }

  routes.forEach((r) => {
    if (r.path) allCoords.push(...r.path);
    else if (r.encoded_polyline) allCoords.push(...decodePolyline(r.encoded_polyline));
  });

  const minLat = allCoords.length > 0 ? Math.min(...allCoords.map((c) => c.lat)) - 0.02 : 37.4;
  const maxLat = allCoords.length > 0 ? Math.max(...allCoords.map((c) => c.lat)) + 0.02 : 37.8;
  const minLng = allCoords.length > 0 ? Math.min(...allCoords.map((c) => c.lng)) - 0.02 : -122.5;
  const maxLng = allCoords.length > 0 ? Math.max(...allCoords.map((c) => c.lng)) + 0.02 : -122.0;

  const latSpan = maxLat - minLat || 0.01;
  const lngSpan = maxLng - minLng || 0.01;

  const toSvgX = (lng: number) => 30 + ((lng - minLng) / lngSpan) * 340;
  const toSvgY = (lat: number) => 190 - ((lat - minLat) / latSpan) * 160;

  const sortedWaypoints = [...waypoints].sort((a, b) => a.stop_order - b.stop_order);

  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl p-3.5 text-white shadow-inner ${className}`}>
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
        <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Authoritative Route Corridor
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-2 py-0.5 rounded">
            Vector Projection
          </span>
          <span>
            {sortedWaypoints.length} waypoints &bull;{' '}
            {((route?.total_distance_meters || routes[selectedRouteIdx]?.total_distance_meters || 45000) / 1000).toFixed(1)} km
          </span>
        </div>
      </div>

      <svg viewBox="0 0 400 220" className="w-full h-44 bg-slate-950/70 rounded-lg border border-slate-800/80">
        <defs>
          <linearGradient id="gmapSelectedCorridor" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#38bdf8" />
          </linearGradient>
          <radialGradient id="gmapPickupPulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Grid lines */}
        <line x1="20" y1="55" x2="380" y2="55" stroke="#1e293b" strokeDasharray="3 3" />
        <line x1="20" y1="110" x2="380" y2="110" stroke="#1e293b" strokeDasharray="3 3" />
        <line x1="20" y1="165" x2="380" y2="165" stroke="#1e293b" strokeDasharray="3 3" />

        {/* Route Polylines from routes alternatives */}
        {routes.map((r, idx) => {
          const isSelected =
            (selectedRouteId && r.route_id === selectedRouteId) ||
            (selectedRouteIdx !== undefined && idx === selectedRouteIdx) ||
            (routes.length === 1);

          let pts: Array<{ lat: number; lng: number }> = [];
          if (r.path && r.path.length > 0) pts = r.path;
          else if (r.encoded_polyline) pts = decodePolyline(r.encoded_polyline);

          if (pts.length < 2) return null;
          const svgPoints = pts.map((p) => `${toSvgX(p.lng)},${toSvgY(p.lat)}`).join(' ');

          return (
            <polyline
              key={r.route_id || idx}
              fill="none"
              stroke={isSelected ? 'url(#gmapSelectedCorridor)' : '#475569'}
              strokeWidth={isSelected ? '5' : '3'}
              strokeOpacity={isSelected ? '0.95' : '0.5'}
              strokeLinecap="round"
              strokeLinejoin="round"
              points={svgPoints}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectRoute && onSelectRoute(r.route_id, idx)}
            />
          );
        })}

        {/* Fallback Waypoints polyline if no routes given */}
        {routes.length === 0 && sortedWaypoints.length > 1 && (
          <polyline
            fill="none"
            stroke="#2563eb"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={sortedWaypoints.map((w) => `${toSvgX(w.longitude)},${toSvgY(w.latitude)}`).join(' ')}
          />
        )}

        {/* Route Waypoints Pins */}
        {sortedWaypoints.map((w, idx) => {
          const cx = toSvgX(w.longitude);
          const cy = toSvgY(w.latitude);
          const isOrigin = w.point_type === 'ORIGIN' || idx === 0;
          const isDest = w.point_type === 'DESTINATION' || idx === sortedWaypoints.length - 1;

          return (
            <g key={w.id || idx}>
              <circle
                cx={cx}
                cy={cy}
                r={isOrigin || isDest ? 7 : 5}
                fill={isOrigin ? '#10b981' : isDest ? '#ef4444' : '#0ea5e9'}
                stroke="#0f172a"
                strokeWidth="2"
              />
              <text
                x={cx}
                y={cy - 9}
                textAnchor="middle"
                fontSize="9"
                fill={isOrigin || isDest ? '#ffffff' : '#94a3b8'}
                fontWeight={isOrigin || isDest ? 'bold' : 'normal'}
              >
                {isOrigin ? 'A' : isDest ? 'B' : String(w.stop_order || idx)}
              </text>
            </g>
          );
        })}

        {/* Passenger Pickup Pin */}
        {pickupPoint && (
          <g>
            <circle cx={toSvgX(pickupPoint.longitude)} cy={toSvgY(pickupPoint.latitude)} r="14" fill="url(#gmapPickupPulse)" />
            <circle cx={toSvgX(pickupPoint.longitude)} cy={toSvgY(pickupPoint.latitude)} r="5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1.5" />
            <text x={toSvgX(pickupPoint.longitude)} y={toSvgY(pickupPoint.latitude) + 16} textAnchor="middle" fontSize="9" fill="#f59e0b" fontWeight="bold">
              Pickup
            </text>
          </g>
        )}

        {/* Passenger Drop Pin */}
        {dropPoint && (
          <g>
            <circle cx={toSvgX(dropPoint.longitude)} cy={toSvgY(dropPoint.latitude)} r="5" fill="#a855f7" stroke="#ffffff" strokeWidth="1.5" />
            <text x={toSvgX(dropPoint.longitude)} y={toSvgY(dropPoint.latitude) + 16} textAnchor="middle" fontSize="9" fill="#a855f7" fontWeight="bold">
              Drop
            </text>
          </g>
        )}
      </svg>

      <div className="flex items-center justify-between text-xs text-slate-400 mt-2 px-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Origin (A)
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-sky-500"></span> Stops
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Destination (B)
          </span>
        </div>
        {routes.length > 1 && (
          <span className="text-[11px] text-blue-400 font-medium">
            Click lines or cards to switch routes
          </span>
        )}
      </div>
    </div>
  );
};
