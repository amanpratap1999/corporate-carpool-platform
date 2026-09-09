'use client';

import React from 'react';
import { RouteWaypoint, RideRoute } from '@/domain/types';

interface CorridorMapProps {
  route: RideRoute;
  waypoints: RouteWaypoint[];
  pickupLat?: number;
  pickupLng?: number;
  dropLat?: number;
  dropLng?: number;
}

export const CorridorMap: React.FC<CorridorMapProps> = ({
  route,
  waypoints,
  pickupLat,
  pickupLng,
  dropLat,
  dropLng,
}) => {
  // Normalize coordinates to 400x220 SVG viewport
  const minLat = Math.min(route.min_latitude, pickupLat ?? route.min_latitude, dropLat ?? route.min_latitude) - 0.02;
  const maxLat = Math.max(route.max_latitude, pickupLat ?? route.max_latitude, dropLat ?? route.max_latitude) + 0.02;
  const minLng = Math.min(route.min_longitude, pickupLng ?? route.min_longitude, dropLng ?? route.min_longitude) - 0.02;
  const maxLng = Math.max(route.max_longitude, pickupLng ?? route.max_longitude, dropLng ?? route.max_longitude) + 0.02;

  const latSpan = maxLat - minLat || 0.01;
  const lngSpan = maxLng - minLng || 0.01;

  const toSvgX = (lng: number) => {
    return 30 + ((lng - minLng) / lngSpan) * 340;
  };

  const toSvgY = (lat: number) => {
    // Invert Y axis for map (North is top)
    return 190 - ((lat - minLat) / latSpan) * 160;
  };

  const sortedWaypoints = [...waypoints].sort((a, b) => a.stop_order - b.stop_order);
  const pathPoints = sortedWaypoints.map((w) => `${toSvgX(w.longitude)},${toSvgY(w.latitude)}`).join(' ');

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-white shadow-inner">
      <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
        <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          Structured Route Corridor
        </span>
        <span>{sortedWaypoints.length} waypoints &bull; {(route.total_distance_meters / 1000).toFixed(1)} km</span>
      </div>

      <svg viewBox="0 0 400 220" className="w-full h-44 bg-slate-950/60 rounded-lg border border-slate-800/80">
        <defs>
          <linearGradient id="corridorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="50%" stopColor="#06b6d4" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
          <radialGradient id="detourPulse" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Background Grid Lines */}
        <line x1="20" y1="55" x2="380" y2="55" stroke="#1e293b" strokeDasharray="3 3" />
        <line x1="20" y1="110" x2="380" y2="110" stroke="#1e293b" strokeDasharray="3 3" />
        <line x1="20" y1="165" x2="380" y2="165" stroke="#1e293b" strokeDasharray="3 3" />

        {/* Corridor Route Polyline */}
        {sortedWaypoints.length > 1 && (
          <polyline
            fill="none"
            stroke="url(#corridorGradient)"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            points={pathPoints}
          />
        )}

        {/* Route Waypoints */}
        {sortedWaypoints.map((w, idx) => {
          const cx = toSvgX(w.longitude);
          const cy = toSvgY(w.latitude);
          const isTerminus = idx === 0 || idx === sortedWaypoints.length - 1;

          return (
            <g key={w.id || idx}>
              <circle
                cx={cx}
                cy={cy}
                r={isTerminus ? 6 : 4}
                fill={idx === 0 ? '#10b981' : isTerminus ? '#3b82f6' : '#06b6d4'}
                stroke="#0f172a"
                strokeWidth="2"
              />
              <text
                x={cx}
                y={cy - 9}
                textAnchor="middle"
                fontSize="9"
                fill={isTerminus ? '#ffffff' : '#94a3b8'}
                fontWeight={isTerminus ? 'bold' : 'normal'}
              >
                {w.address_text ? w.address_text.split(',')[0] : `Stop ${w.stop_order}`}
              </text>
            </g>
          );
        })}

        {/* Passenger Pickup Pin (if specified) */}
        {pickupLat !== undefined && pickupLng !== undefined && (
          <g>
            <circle
              cx={toSvgX(pickupLng)}
              cy={toSvgY(pickupLat)}
              r="14"
              fill="url(#detourPulse)"
            />
            <circle
              cx={toSvgX(pickupLng)}
              cy={toSvgY(pickupLat)}
              r="5"
              fill="#f59e0b"
              stroke="#ffffff"
              strokeWidth="1.5"
            />
            <text
              x={toSvgX(pickupLng)}
              y={toSvgY(pickupLat) + 16}
              textAnchor="middle"
              fontSize="9"
              fill="#f59e0b"
              fontWeight="bold"
            >
              Passenger Pickup
            </text>
          </g>
        )}
      </svg>

      <div className="flex items-center justify-between text-xs text-slate-400 mt-2 px-1">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Origin
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-500"></span> Corridor Waypoint
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Destination
          </span>
        </div>
        {pickupLat !== undefined && (
          <span className="flex items-center gap-1 text-amber-400 font-medium">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Requested Boarding
          </span>
        )}
      </div>
    </div>
  );
};
