'use client';

import React, { useState, useEffect } from 'react';
import {
  Car,
  MapPin,
  Calendar,
  Clock,
  Users,
  Search,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Play,
  Flag,
  Plus,
  Shield,
  Leaf,
  Navigation,
  ArrowRight,
  Info,
} from 'lucide-react';
import { Navbar } from '@/components/Navbar';
import { CorridorMap } from '@/components/CorridorMap';
import { Vehicle } from '@/domain/types';

export default function HomePage() {
  // Default to Alex Rivera (Driver)
  const [activeUserId, setActiveUserId] = useState<string>('22222222-2222-4222-8222-222222222222');
  const [activeTab, setActiveTab] = useState<string>('search');

  // Tomorrow's date string YYYY-MM-DD
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Rider Search State
  const [searchDate, setSearchDate] = useState<string>(tomorrowStr);
  const [originPreset, setOriginPreset] = useState<string>('millbrae');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);

  // Booking Modal State
  const [bookingRide, setBookingRide] = useState<any | null>(null);
  const [bookingSeats, setBookingSeats] = useState<number>(1);
  const [pickupAddress, setPickupAddress] = useState<string>('Millbrae BART Station East Turnaround');
  const [dropAddress, setDropAddress] = useState<string>('Acme HQ Tech Campus - Building A');
  const [bookingNote, setBookingNote] = useState<string>('Looking forward to sharing the commute!');
  const [actionFeedback, setActionFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Rider Bookings State
  const [myBookings, setMyBookings] = useState<any[]>([]);

  // Driver Rides State
  const [driverRides, setDriverRides] = useState<any[]>([]);

  // Vehicles State
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [newVehicle, setNewVehicle] = useState({
    make: 'Honda',
    model: 'Civic Touring',
    year: 2023,
    color: 'Sonic Gray',
    license_plate: '9ABC999',
    total_seats: 5,
  });

  // Publish Ride Modal State
  const [showPublishModal, setShowPublishModal] = useState<boolean>(false);
  const [newRideVehicleId, setNewRideVehicleId] = useState<string>('');
  const [newRideDepTime, setNewRideDepTime] = useState<string>(`${tomorrowStr}T08:30`);
  const [newRideSeats, setNewRideSeats] = useState<number>(3);
  const [newRideNotes, setNewRideNotes] = useState<string>('Smooth highway commute. AC on, quiet ride.');

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Preset location coordinates
  const PRESETS: Record<string, { name: string; lat: number; lng: number; addr: string }> = {
    millbrae: {
      name: 'Millbrae BART Station',
      lat: 37.5997,
      lng: -122.3867,
      addr: '100 California Dr, Millbrae, CA',
    },
    sanmateo: {
      name: 'San Mateo Downtown',
      lat: 37.563,
      lng: -122.3255,
      addr: '300 S El Camino Real, San Mateo, CA',
    },
    mission: {
      name: 'SF Mission Dolores',
      lat: 37.7615,
      lng: -122.426,
      addr: '450 Dolores St, San Francisco, CA',
    },
  };

  const DESTINATION = {
    name: 'Acme HQ Tech Campus',
    lat: 37.422,
    lng: -122.0841,
    addr: '1600 Amphitheatre Pkwy, Mountain View, CA',
  };

  // --------------------------------------------------------------------------
  // Data Fetching Functions
  // --------------------------------------------------------------------------
  const runSearch = async () => {
    setSearchLoading(true);
    setActionFeedback(null);
    try {
      const preset = PRESETS[originPreset];
      const params = new URLSearchParams({
        origin_lat: preset.lat.toString(),
        origin_lng: preset.lng.toString(),
        dest_lat: DESTINATION.lat.toString(),
        dest_lng: DESTINATION.lng.toString(),
        date: searchDate,
        seats_needed: '1',
        max_detour_meters: '3000',
      });

      const res = await fetch(`/api/v1/rides/search?${params.toString()}`, {
        headers: { 'x-user-id': activeUserId },
      });
      const data = await res.json();
      setSearchResults(data.rides || []);
      setHasSearched(true);
    } catch {
      setActionFeedback({ type: 'error', message: 'Failed to search corridor rides.' });
    } finally {
      setSearchLoading(false);
    }
  };

  const fetchBookings = async () => {
    try {
      const res = await fetch('/api/v1/rides?role=rider', {
        headers: { 'x-user-id': activeUserId },
      });
      const data = await res.json();
      setMyBookings(data.bookings || []);
    } catch {
      // ignore
    }
  };

  const fetchDriverRides = async () => {
    try {
      const res = await fetch('/api/v1/rides?role=driver', {
        headers: { 'x-user-id': activeUserId },
      });
      const data = await res.json();
      setDriverRides(data.rides || []);
    } catch {
      // ignore
    }
  };

  const fetchVehicles = async () => {
    try {
      const res = await fetch('/api/v1/vehicles', {
        headers: { 'x-user-id': activeUserId },
      });
      const data = await res.json();
      setVehicles(data.vehicles || []);
      if (data.vehicles && data.vehicles.length > 0 && !newRideVehicleId) {
        setNewRideVehicleId(data.vehicles[0].id);
      }
    } catch {
      // ignore
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch('/api/v1/audit-logs', {
        headers: { 'x-user-id': activeUserId },
      });
      const data = await res.json();
      setAuditLogs(data.logs || []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (activeTab === 'search') runSearch();
    if (activeTab === 'bookings') fetchBookings();
    if (activeTab === 'driver') fetchDriverRides();
    if (activeTab === 'vehicles') fetchVehicles();
    if (activeTab === 'audit') fetchAuditLogs();
  }, [activeUserId, activeTab]);

  // --------------------------------------------------------------------------
  // Action Handlers (Rider & Driver)
  // --------------------------------------------------------------------------

  // Rider submits request
  const submitSeatRequest = async () => {
    if (!bookingRide) return;
    const preset = PRESETS[originPreset];

    try {
      const res = await fetch(`/api/v1/rides/${bookingRide.ride.id}/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': activeUserId,
        },
        body: JSON.stringify({
          requested_seats: bookingSeats,
          rider_note: bookingNote,
          pickup_point: {
            address_text: pickupAddress || preset.addr,
            latitude: preset.lat,
            longitude: preset.lng,
            landmark_note: 'Meeting point designated near main entrance',
          },
          drop_point: {
            address_text: dropAddress || DESTINATION.addr,
            latitude: DESTINATION.lat,
            longitude: DESTINATION.lng,
            landmark_note: 'Dropoff at Corporate Building Gate',
          },
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        setActionFeedback({ type: 'error', message: result.detail || 'Failed to submit seat request.' });
      } else {
        setActionFeedback({
          type: 'success',
          message: 'Seat request submitted! Driver has been notified for approval.',
        });
        setBookingRide(null);
        setActiveTab('bookings');
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'An unexpected network error occurred.' });
    }
  };

  // Driver approves request (Atomic seat decrement!)
  const handleAcceptRequest = async (requestId: string) => {
    try {
      const res = await fetch(`/api/v1/ride-requests/${requestId}/accept`, {
        method: 'POST',
        headers: { 'x-user-id': activeUserId },
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback({
          type: 'success',
          message: `Request approved! 1 seat atomically reserved. Remaining: ${data.ride.available_seats}`,
        });
        fetchDriverRides();
      } else {
        setActionFeedback({ type: 'error', message: data.detail || 'Failed to accept request.' });
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Error communicating with server.' });
    }
  };

  // Driver rejects request
  const handleRejectRequest = async (requestId: string) => {
    const reason = prompt('Reason for declining this request (optional):') || 'Route detour too large';
    try {
      const res = await fetch(`/api/v1/ride-requests/${requestId}/reject`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': activeUserId,
        },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        setActionFeedback({ type: 'success', message: 'Request declined.' });
        fetchDriverRides();
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Failed to decline request.' });
    }
  };

  // Rider or Driver cancels request (Atomic seat restore!)
  const handleCancelRequest = async (requestId: string) => {
    const reason = prompt('Cancellation reason:') || 'Personal schedule change';
    try {
      const res = await fetch(`/api/v1/ride-requests/${requestId}/cancel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-id': activeUserId,
        },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback({
          type: 'success',
          message: 'Booking cancelled. Seats restored to available pool.',
        });
        fetchBookings();
        fetchDriverRides();
      } else {
        setActionFeedback({ type: 'error', message: data.detail || 'Failed to cancel booking.' });
      }
    } catch {
      setActionFeedback({ type: 'error', message: 'Error cancelling request.' });
    }
  };

  // Driver starts ride
  const handleStartRide = async (rideId: string) => {
    const res = await fetch(`/api/v1/rides/${rideId}/start`, {
      method: 'POST',
      headers: { 'x-user-id': activeUserId },
    });
    if (res.ok) {
      setActionFeedback({ type: 'success', message: 'Ride marked IN_PROGRESS. Passengers alerted!' });
      fetchDriverRides();
    }
  };

  // Driver completes ride
  const handleCompleteRide = async (rideId: string) => {
    const res = await fetch(`/api/v1/rides/${rideId}/complete`, {
      method: 'POST',
      headers: { 'x-user-id': activeUserId },
    });
    if (res.ok) {
      setActionFeedback({ type: 'success', message: 'Ride COMPLETED. Carbon offset logged!' });
      fetchDriverRides();
    }
  };

  // Driver cancels entire ride
  const handleCancelRide = async (rideId: string) => {
    const reason = prompt('Reason for cancelling the ride:') || 'Driver unexpected conflict';
    const res = await fetch(`/api/v1/rides/${rideId}/cancel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': activeUserId,
      },
      body: JSON.stringify({ reason }),
    });
    if (res.ok) {
      setActionFeedback({ type: 'success', message: 'Ride cancelled. Passengers notified.' });
      fetchDriverRides();
    }
  };

  // Driver registers new vehicle
  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/v1/vehicles', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': activeUserId,
      },
      body: JSON.stringify(newVehicle),
    });
    if (res.ok) {
      setActionFeedback({ type: 'success', message: 'Vehicle registered and verified for carpooling!' });
      fetchVehicles();
    } else {
      const err = await res.json();
      setActionFeedback({ type: 'error', message: err.detail || 'Failed to register vehicle.' });
    }
  };

  // Driver publishes new ride
  const handlePublishRide = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRideVehicleId) {
      alert('Please select a vehicle.');
      return;
    }

    const payload = {
      vehicle_id: newRideVehicleId,
      departure_time: new Date(newRideDepTime).toISOString(),
      arrival_time_estimated: new Date(new Date(newRideDepTime).getTime() + 45 * 60000).toISOString(),
      total_seats_offered: newRideSeats,
      cost_per_seat_cents: 350,
      notes: newRideNotes,
      route: {
        origin_address: '450 Dolores St, San Francisco, CA',
        origin_latitude: 37.7615,
        origin_longitude: -122.426,
        destination_address: 'Acme HQ Tech Campus, Mountain View, CA',
        destination_latitude: 37.422,
        destination_longitude: -122.0841,
        total_distance_meters: 53200,
        total_duration_seconds: 2700,
        waypoints: [
          {
            stop_order: 0,
            point_type: 'ORIGIN',
            address_text: 'SF Mission Dolores',
            latitude: 37.7615,
            longitude: -122.426,
          },
          {
            stop_order: 1,
            point_type: 'CORRIDOR',
            address_text: 'Millbrae BART Transit Interchange',
            latitude: 37.5997,
            longitude: -122.3867,
          },
          {
            stop_order: 2,
            point_type: 'CORRIDOR',
            address_text: 'San Mateo 101 Junction',
            latitude: 37.566,
            longitude: -122.316,
          },
          {
            stop_order: 3,
            point_type: 'DESTINATION',
            address_text: 'Acme HQ Building C Gate',
            latitude: 37.422,
            longitude: -122.0841,
          },
        ],
      },
    };

    const res = await fetch('/api/v1/rides', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': activeUserId,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      setActionFeedback({ type: 'success', message: 'New ride published with structured waypoints!' });
      setShowPublishModal(false);
      fetchDriverRides();
    } else {
      const err = await res.json();
      setActionFeedback({ type: 'error', message: err.detail || 'Failed to publish ride.' });
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        activeUserId={activeUserId}
        onUserChange={setActiveUserId}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Action Notification Banner */}
      {actionFeedback && (
        <div
          className={`px-4 py-3 border-b text-sm flex items-center justify-between transition ${
            actionFeedback.type === 'success'
              ? 'bg-emerald-950/80 border-emerald-800 text-emerald-300'
              : 'bg-rose-950/80 border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2 max-w-7xl mx-auto w-full">
            {actionFeedback.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
            )}
            <span>{actionFeedback.message}</span>
            <button
              onClick={() => setActionFeedback(null)}
              className="ml-auto text-xs underline hover:text-white"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1 w-full">
        {/* ================================================================= */}
        {/* TAB 1: FIND A RIDE (Rider Corridor Search)                        */}
        {/* ================================================================= */}
        {activeTab === 'search' && (
          <div className="space-y-6">
            {/* Search Controls Card */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-4">
                <div>
                  <h1 className="text-xl font-bold text-white flex items-center gap-2">
                    <Navigation className="w-5 h-5 text-emerald-400" />
                    Commuter Corridor Discovery
                  </h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Query scheduled carpools within acceptable pickup detour distance along your commute corridor.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-3 py-1.5 rounded-lg">
                  <Leaf className="w-3.5 h-3.5" />
                  <span>Acme Commute Sustainability Pilot</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Your Pickup Location (Preset)
                  </label>
                  <select
                    value={originPreset}
                    onChange={(e) => setOriginPreset(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="millbrae">Millbrae BART Station (David's Home)</option>
                    <option value="sanmateo">San Mateo Downtown (Emily's Home)</option>
                    <option value="mission">SF Mission Dolores (Alex's Origin)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Corporate Destination</label>
                  <input
                    type="text"
                    readOnly
                    value="Acme HQ Campus (Mountain View)"
                    className="w-full bg-slate-800/60 border border-slate-700/60 rounded-xl px-3.5 py-2.5 text-sm text-slate-300 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Commute Date</label>
                  <input
                    type="date"
                    value={searchDate}
                    onChange={(e) => setSearchDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-end">
                  <button
                    onClick={runSearch}
                    disabled={searchLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                  >
                    <Search className="w-4 h-4" />
                    {searchLoading ? 'Matching...' : 'Find Matches'}
                  </button>
                </div>
              </div>
            </div>

            {/* Results Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>
                  Found <strong className="text-white">{searchResults.length}</strong> active carpool offering(s) matching your corridor
                </span>
                <span>Max Detour Threshold: 3,000 meters</span>
              </div>

              {searchResults.length === 0 && hasSearched && (
                <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                  <Car className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                  <h3 className="text-base font-semibold text-white mb-1">No corridor matches on this date</h3>
                  <p className="text-xs max-w-md mx-auto">
                    Try another commute date or ask a verified driver in your department to offer a ride.
                  </p>
                </div>
              )}

              {searchResults.map((match) => {
                const { ride, driver, vehicle, route, waypoints, nearestPickupDistanceMeters } = match;
                const preset = PRESETS[originPreset];

                return (
                  <div
                    key={ride.id}
                    className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl hover:border-slate-700 transition space-y-4"
                  >
                    {/* Header: Driver info, time, seats */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-500 flex items-center justify-center font-bold text-white text-base shadow-md">
                          {driver.full_name.charAt(0)}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-base">{driver.full_name}</span>
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full font-medium">
                              Verified Host
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {driver.work_department} &bull; {driver.work_location}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <div className="text-xs text-slate-400">Departs at</div>
                          <div className="font-bold text-emerald-400 text-base flex items-center gap-1 justify-end">
                            <Clock className="w-4 h-4" />
                            {new Date(ride.departure_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-xs text-slate-400">Available</div>
                          <div className="font-bold text-white text-base flex items-center gap-1 justify-end">
                            <Users className="w-4 h-4 text-slate-400" />
                            {ride.available_seats} / {ride.total_seats_offered} seats
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Proximity Pill & Vehicle Details */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Car className="w-4 h-4 text-emerald-400" />
                        <span>
                          {vehicle.make} {vehicle.model} ({vehicle.color}) &bull; Plate:{' '}
                          <strong className="text-white">{vehicle.license_plate}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-emerald-400 font-medium">
                        <Navigation className="w-4 h-4" />
                        <span>Pickup detour: {nearestPickupDistanceMeters}m from driver path</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-300 justify-end">
                        <span>Cost share:</span>
                        <strong className="text-white">${(ride.cost_per_seat_cents / 100).toFixed(2)}</strong>
                      </div>
                    </div>

                    {/* Interactive Corridor Map Widget */}
                    <CorridorMap
                      route={route}
                      waypoints={waypoints}
                      pickupLat={preset.lat}
                      pickupLng={preset.lng}
                      dropLat={DESTINATION.lat}
                      dropLng={DESTINATION.lng}
                    />

                    {/* Card Actions */}
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-slate-400 italic">
                        &ldquo;{ride.notes || 'Direct campus commute.'}&rdquo;
                      </span>

                      <button
                        onClick={() => {
                          setBookingRide(match);
                          setPickupAddress(preset.addr);
                          setDropAddress(DESTINATION.addr);
                        }}
                        className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-5 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
                      >
                        <span>Request Seat</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* BOOKING MODAL (Rider explicit pickup/drop specification)           */}
        {/* ================================================================= */}
        {bookingRide && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Car className="w-5 h-5 text-emerald-400" />
                  Confirm Seat Booking Request
                </h3>
                <button
                  onClick={() => setBookingRide(null)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <div className="text-xs text-slate-300 space-y-1">
                <div>
                  Host: <strong className="text-white">{bookingRide.driver.full_name}</strong> &bull; Vehicle:{' '}
                  {bookingRide.vehicle.make} {bookingRide.vehicle.model}
                </div>
                <div>
                  Departure:{' '}
                  <strong className="text-emerald-400">
                    {new Date(bookingRide.ride.departure_time).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </strong>{' '}
                  &bull; Remaining Seats: {bookingRide.ride.available_seats}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Your Exact Boarding Point (Pickup Address)
                  </label>
                  <input
                    type="text"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Your Destination (Drop Address)
                  </label>
                  <input
                    type="text"
                    value={dropAddress}
                    onChange={(e) => setDropAddress(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Seats Requested</label>
                    <select
                      value={bookingSeats}
                      onChange={(e) => setBookingSeats(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value={1}>1 Passenger Seat</option>
                      {bookingRide.ride.available_seats >= 2 && <option value={2}>2 Passenger Seats</option>}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Cost Per Seat</label>
                    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl px-3 py-2 text-xs text-slate-300 font-bold">
                      ${(bookingRide.ride.cost_per_seat_cents / 100).toFixed(2)}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Note to Host</label>
                  <textarea
                    rows={2}
                    value={bookingNote}
                    onChange={(e) => setBookingNote(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  onClick={() => setBookingRide(null)}
                  className="px-4 py-2 text-xs text-slate-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  onClick={submitSeatRequest}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-5 py-2 rounded-xl text-xs transition shadow-lg shadow-emerald-600/20"
                >
                  Confirm & Submit Request
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 2: MY BOOKINGS (Rider Manifest & Booking Lifecycle)           */}
        {/* ================================================================= */}
        {activeTab === 'bookings' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  My Commute Bookings
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Track your booked seats, status transitions, and driver contact details.
                </p>
              </div>
              <button
                onClick={fetchBookings}
                className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition"
              >
                Refresh Status
              </button>
            </div>

            {myBookings.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                <Calendar className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                <h3 className="text-base font-semibold text-white mb-1">No active bookings</h3>
                <p className="text-xs max-w-sm mx-auto mb-4">
                  You haven&apos;t requested any carpools yet. Use the Find a Ride tab to search routes.
                </p>
                <button
                  onClick={() => setActiveTab('search')}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs"
                >
                  Search Commutes
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {myBookings.map((b) => {
                  const { request, ride, driver, vehicle, pickup, drop } = b;
                  const statusColors: Record<string, string> = {
                    PENDING: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
                    ACCEPTED: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
                    REJECTED: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
                    CANCELLED: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
                    COMPLETED: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
                  };

                  return (
                    <div
                      key={request.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-white">
                            {driver?.full_name?.charAt(0) || 'H'}
                          </div>
                          <div>
                            <div className="font-bold text-white text-sm">{driver?.full_name || 'Host'}</div>
                            <div className="text-xs text-slate-400">{driver?.email}</div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span
                            className={`text-xs px-3 py-1 rounded-full font-bold border uppercase tracking-wider ${
                              statusColors[request.status] || 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {request.status}
                          </span>
                          {(request.status === 'PENDING' || request.status === 'ACCEPTED') && (
                            <button
                              onClick={() => handleCancelRequest(request.id)}
                              className="text-xs text-rose-400 hover:text-rose-300 underline"
                            >
                              Cancel Booking
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
                        <div>
                          <span className="text-slate-400 block mb-0.5">Pickup Point:</span>
                          <strong className="text-white">{pickup?.address_text}</strong>
                          {pickup?.landmark_note && (
                            <div className="text-slate-400 italic mt-0.5">&ldquo;{pickup.landmark_note}&rdquo;</div>
                          )}
                        </div>
                        <div>
                          <span className="text-slate-400 block mb-0.5">Drop-off Destination:</span>
                          <strong className="text-white">{drop?.address_text}</strong>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
                        <span>
                          Vehicle: <strong className="text-slate-200">{vehicle?.make} {vehicle?.model}</strong> &bull; Plate:{' '}
                          <strong className="text-slate-200">{vehicle?.license_plate}</strong>
                        </span>
                        <span>Requested Seats: <strong className="text-white">{request.requested_seats}</strong></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 3: HOST COMMUTES (Driver Ride Publishing & Request Management) */}
        {/* ================================================================= */}
        {activeTab === 'driver' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Car className="w-5 h-5 text-emerald-400" />
                  Host Commute Management
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Publish scheduled commutes, review incoming seat requests, and manage active trip lifecycles.
                </p>
              </div>
              <button
                onClick={() => setShowPublishModal(true)}
                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs flex items-center gap-1.5 transition shadow-lg shadow-emerald-600/20"
              >
                <Plus className="w-4 h-4" />
                Publish New Ride
              </button>
            </div>

            {driverRides.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center text-slate-400">
                <Car className="w-12 h-12 mx-auto text-slate-600 mb-3" />
                <h3 className="text-base font-semibold text-white mb-1">No commutes published</h3>
                <p className="text-xs max-w-sm mx-auto mb-4">
                  You haven&apos;t offered any rides yet. Share your daily commute to help colleagues and reduce emissions.
                </p>
                <button
                  onClick={() => setShowPublishModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs"
                >
                  Publish Ride Offering
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {driverRides.map((ride) => {
                  const requests: any[] = ride.requests || [];
                  const pendingReqs = requests.filter((r) => r.status === 'PENDING');
                  const acceptedReqs = requests.filter((r) => r.status === 'ACCEPTED');

                  return (
                    <div
                      key={ride.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4"
                    >
                      {/* Ride header & controls */}
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-base">
                              {new Date(ride.departure_time).toLocaleDateString(undefined, {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                              })}{' '}
                              Commute
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                                ride.status === 'SCHEDULED'
                                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                  : ride.status === 'IN_PROGRESS'
                                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                                  : ride.status === 'COMPLETED'
                                  ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                                  : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                              }`}
                            >
                              {ride.status}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                            <span>
                              Departs:{' '}
                              <strong className="text-white">
                                {new Date(ride.departure_time).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </strong>
                            </span>
                            <span>&bull;</span>
                            <span>
                              Available Seats:{' '}
                              <strong className="text-emerald-400">
                                {ride.available_seats} / {ride.total_seats_offered}
                              </strong>
                            </span>
                          </div>
                        </div>

                        {/* Lifecycle action buttons */}
                        <div className="flex items-center gap-2">
                          {ride.status === 'SCHEDULED' && (
                            <>
                              <button
                                onClick={() => handleStartRide(ride.id)}
                                className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition"
                              >
                                <Play className="w-3.5 h-3.5" /> Start Ride
                              </button>
                              <button
                                onClick={() => handleCancelRide(ride.id)}
                                className="bg-rose-900/30 hover:bg-rose-900/50 text-rose-300 border border-rose-800/40 px-3 py-1.5 rounded-lg text-xs transition"
                              >
                                Cancel Ride
                              </button>
                            </>
                          )}
                          {ride.status === 'IN_PROGRESS' && (
                            <button
                              onClick={() => handleCompleteRide(ride.id)}
                              className="bg-blue-600 hover:bg-blue-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition"
                            >
                              <Flag className="w-3.5 h-3.5" /> Complete Ride
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Route Waypoints & BBox Summary */}
                      {ride.route && (
                        <div className="text-xs bg-slate-950/40 p-3 rounded-xl border border-slate-800 space-y-1">
                          <div className="text-slate-400">
                            Route: <strong className="text-white">{ride.route.origin_address}</strong> &rarr;{' '}
                            <strong className="text-white">{ride.route.destination_address}</strong>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Corridor distance: {(ride.route.total_distance_meters / 1000).toFixed(1)} km &bull; Waypoints: {ride.waypoints?.length || 0}
                          </div>
                        </div>
                      )}

                      {/* Section A: Pending Requests (Driver can Accept or Reject) */}
                      <div className="space-y-2">
                        <div className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Pending Passenger Requests ({pendingReqs.length})</span>
                        </div>

                        {pendingReqs.length === 0 ? (
                          <div className="text-xs text-slate-500 italic px-2">No pending seat requests.</div>
                        ) : (
                          <div className="space-y-2">
                            {pendingReqs.map((req) => (
                              <div
                                key={req.id}
                                className="bg-amber-950/20 border border-amber-800/40 rounded-xl p-3 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
                              >
                                <div>
                                  <div className="font-bold text-white text-sm">
                                    {req.passenger?.full_name || 'Colleague'}
                                    <span className="text-[11px] font-normal text-slate-400 ml-2">
                                      ({req.passenger?.work_department})
                                    </span>
                                  </div>
                                  <div className="text-slate-300 mt-0.5">
                                    Pickup: <strong className="text-amber-300">{req.pickup?.address_text}</strong>
                                  </div>
                                  {req.rider_note && (
                                    <div className="text-slate-400 italic mt-0.5">&ldquo;{req.rider_note}&rdquo;</div>
                                  )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  <button
                                    onClick={() => handleAcceptRequest(req.id)}
                                    disabled={ride.available_seats < req.requested_seats}
                                    className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-slate-950 font-bold px-3 py-1.5 rounded-lg text-xs transition"
                                  >
                                    Accept ({req.requested_seats} Seat)
                                  </button>
                                  <button
                                    onClick={() => handleRejectRequest(req.id)}
                                    className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-1.5 rounded-lg text-xs transition"
                                  >
                                    Decline
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Section B: Confirmed Passenger Manifest */}
                      <div className="space-y-2 pt-2 border-t border-slate-800">
                        <div className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Confirmed Passenger Manifest ({acceptedReqs.length})</span>
                        </div>

                        {acceptedReqs.length === 0 ? (
                          <div className="text-xs text-slate-500 italic px-2">No passengers confirmed yet.</div>
                        ) : (
                          <div className="space-y-2">
                            {acceptedReqs.map((req) => (
                              <div
                                key={req.id}
                                className="bg-slate-950/60 border border-slate-800 rounded-xl p-3 flex items-center justify-between text-xs"
                              >
                                <div>
                                  <strong className="text-white">{req.passenger?.full_name}</strong>
                                  <span className="text-slate-400 ml-2">({req.passenger?.phone_number || req.passenger?.email})</span>
                                  <div className="text-slate-400 text-[11px] mt-0.5">
                                    Pickup: {req.pickup?.address_text}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <span className="text-emerald-400 font-semibold">{req.requested_seats} seat reserved</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* PUBLISH RIDE MODAL (Driver Route Creation)                        */}
        {/* ================================================================= */}
        {showPublishModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Car className="w-5 h-5 text-emerald-400" />
                  Publish Daily Commute Ride
                </h3>
                <button
                  onClick={() => setShowPublishModal(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handlePublishRide} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Select Registered Vehicle</label>
                  <select
                    value={newRideVehicleId}
                    onChange={(e) => setNewRideVehicleId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    required
                  >
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.make} {v.model} ({v.color}) - Plate: {v.license_plate} ({v.total_seats - 1} max passenger seats)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Departure Time</label>
                    <input
                      type="datetime-local"
                      value={newRideDepTime}
                      onChange={(e) => setNewRideDepTime(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Passenger Seats Offered</label>
                    <select
                      value={newRideSeats}
                      onChange={(e) => setNewRideSeats(Number(e.target.value))}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    >
                      <option value={1}>1 Seat</option>
                      <option value={2}>2 Seats</option>
                      <option value={3}>3 Seats</option>
                      <option value={4}>4 Seats</option>
                    </select>
                  </div>
                </div>

                <div className="bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-xs space-y-1">
                  <div className="font-semibold text-emerald-400">Pre-configured Commute Corridor:</div>
                  <div className="text-slate-300">Origin: SF Mission Dolores (450 Dolores St)</div>
                  <div className="text-slate-400">Waypoints: Millbrae BART Station &rarr; San Mateo 101 Junction</div>
                  <div className="text-slate-300">Destination: Acme HQ Tech Campus (Mountain View)</div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Trip Notes for Passengers</label>
                  <input
                    type="text"
                    value={newRideNotes}
                    onChange={(e) => setNewRideNotes(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setShowPublishModal(false)}
                    className="px-4 py-2 text-xs text-slate-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-5 py-2 rounded-xl text-xs transition shadow-lg shadow-emerald-600/20"
                  >
                    Publish Commute
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 4: MY VEHICLES (Driver Fleet Registration)                    */}
        {/* ================================================================= */}
        {activeTab === 'vehicles' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Car className="w-5 h-5 text-emerald-400" />
                Driver Vehicle Registry
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Register personal vehicles used for company carpooling. Unlocks driver capabilities.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Vehicle List */}
              <div className="md:col-span-2 space-y-4">
                <h3 className="text-sm font-bold text-slate-300">Registered Vehicles ({vehicles.length})</h3>
                {vehicles.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-400 text-xs">
                    No vehicles registered yet for this user.
                  </div>
                ) : (
                  vehicles.map((v) => (
                    <div
                      key={v.id}
                      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-emerald-950/60 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
                          <Car className="w-6 h-6" />
                        </div>
                        <div>
                          <div className="font-bold text-white text-base">
                            {v.year} {v.make} {v.model}
                          </div>
                          <div className="text-xs text-slate-400">
                            Color: <strong className="text-slate-200">{v.color}</strong> &bull; Total Seats:{' '}
                            <strong className="text-slate-200">{v.total_seats}</strong> (max {v.total_seats - 1} passengers)
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="text-xs font-mono font-bold bg-slate-800 px-3 py-1 rounded-lg border border-slate-700 text-slate-200">
                          {v.license_plate}
                        </span>
                        <div className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1 justify-end">
                          <Shield className="w-3 h-3" /> Verified Active
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add Vehicle Form */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl h-fit space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-slate-800 pb-2">
                  <Plus className="w-4 h-4 text-emerald-400" />
                  Register New Vehicle
                </h3>

                <form onSubmit={handleCreateVehicle} className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 mb-1">Make</label>
                      <input
                        type="text"
                        value={newVehicle.make}
                        onChange={(e) => setNewVehicle({ ...newVehicle, make: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Model</label>
                      <input
                        type="text"
                        value={newVehicle.model}
                        onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 mb-1">Year</label>
                      <input
                        type="number"
                        value={newVehicle.year}
                        onChange={(e) => setNewVehicle({ ...newVehicle, year: Number(e.target.value) })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Color</label>
                      <input
                        type="text"
                        value={newVehicle.color}
                        onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                        required
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-400 mb-1">License Plate</label>
                      <input
                        type="text"
                        value={newVehicle.license_plate}
                        onChange={(e) => setNewVehicle({ ...newVehicle, license_plate: e.target.value.toUpperCase() })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white uppercase font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">Total Seats</label>
                      <input
                        type="number"
                        min={2}
                        max={15}
                        value={newVehicle.total_seats}
                        onChange={(e) => setNewVehicle({ ...newVehicle, total_seats: Number(e.target.value) })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-2 rounded-xl transition mt-2 shadow-md shadow-emerald-600/20"
                  >
                    Add Vehicle
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* TAB 5: COMPLIANCE & AUDIT (Admin Trail & ESG Dashboard)            */}
        {/* ================================================================= */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-emerald-400" />
                  Compliance & Immutable Audit Ledger
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Append-only audit trail recording state transitions, atomic reservations, cancellations, and compliance events.
                </p>
              </div>
              <button
                onClick={fetchAuditLogs}
                className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition"
              >
                Refresh Audit Trail
              </button>
            </div>

            {/* Sustainability Metrics Banner */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center">
                  <Leaf className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-400">Carbon Abated</div>
                  <div className="text-lg font-bold text-white">48.6 kg CO2e</div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-400">Commute Occupancy</div>
                  <div className="text-lg font-bold text-white">2.6 riders/veh</div>
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-lg flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
                  <Shield className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs text-slate-400">Multi-Tenant Isolation</div>
                  <div className="text-lg font-bold text-white">100% Enforced</div>
                </div>
              </div>
            </div>

            {/* Audit Logs Table */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-4 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200">Audit Events ({auditLogs.length})</span>
                <span className="text-slate-400">RFC 7807 &bull; Tenant: acme-corp</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-slate-800">
                  <thead className="bg-slate-950/60 text-slate-400 font-semibold">
                    <tr>
                      <th className="py-3 px-4">Timestamp</th>
                      <th className="py-3 px-4">Actor</th>
                      <th className="py-3 px-4">Entity</th>
                      <th className="py-3 px-4">Action</th>
                      <th className="py-3 px-4">Transition</th>
                      <th className="py-3 px-4">Metadata</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 text-slate-300">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-800/40 transition font-mono">
                        <td className="py-2.5 px-4 text-slate-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 px-4 font-sans text-white font-medium whitespace-nowrap">
                          {log.actor_name}
                        </td>
                        <td className="py-2.5 px-4 text-cyan-400 whitespace-nowrap">{log.entity_type}</td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          <span className="bg-slate-800 px-2 py-0.5 rounded text-[11px] text-slate-300">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 whitespace-nowrap">
                          {log.from_state ? (
                            <span className="text-slate-400">
                              <span className="text-amber-400">{log.from_state}</span> &rarr;{' '}
                              <span className="text-emerald-400">{log.to_state}</span>
                            </span>
                          ) : (
                            <span className="text-emerald-400">{log.to_state || '—'}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-[10px] text-slate-400 truncate max-w-xs font-mono">
                          {JSON.stringify(log.metadata_json)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
