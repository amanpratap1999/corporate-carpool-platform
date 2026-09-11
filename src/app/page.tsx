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
import { GoogleMapViewer } from '@/components/maps/GoogleMapViewer';
import { PlaceAutocompleteInput, SelectedPlace } from '@/components/maps/PlaceAutocompleteInput';
import { Vehicle, DirectionsRouteOption } from '@/domain/types';
import { getAuthHeaders, isAuthenticated, getStoredUser, clearStoredAuth, setStoredAuth, getStoredToken } from '@/lib/auth-client';

export default function HomePage() {
  // Auth guard — redirect to /login if not authenticated
  const [activeUserId, setActiveUserId] = useState<string>('');
  const [currentUserName, setCurrentUserName] = useState<string>('');
  const [isOrgAdmin, setIsOrgAdmin] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<string>('search');

  // Tomorrow's date string YYYY-MM-DD
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  // Rider Search State
  const [searchDate, setSearchDate] = useState<string>(tomorrowStr);
  const [searchWindowStart, setSearchWindowStart] = useState<string>('');
  const [searchWindowEnd, setSearchWindowEnd] = useState<string>('');
  const [searchSeats, setSearchSeats] = useState<number>(1);
  const [searchOrigin, setSearchOrigin] = useState<SelectedPlace | null>({
    address: '100 California Dr, Millbrae, CA (Millbrae BART)',
    lat: 37.5997,
    lng: -122.3867,
    placeId: 'preset-millbrae',
  });
  const [searchOriginInput, setSearchOriginInput] = useState<string>(
    '100 California Dr, Millbrae, CA (Millbrae BART)'
  );
  const [searchOriginError, setSearchOriginError] = useState<string | null>(null);

  const [searchDestination, setSearchDestination] = useState<SelectedPlace | null>({
    address: '1600 Amphitheatre Pkwy, Mountain View, CA (Acme HQ)',
    lat: 37.422,
    lng: -122.0841,
    placeId: 'preset-acme-hq',
  });
  const [searchDestInput, setSearchDestInput] = useState<string>(
    '1600 Amphitheatre Pkwy, Mountain View, CA (Acme HQ)'
  );
  const [searchDestError, setSearchDestError] = useState<string | null>(null);

  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchDiagnostics, setSearchDiagnostics] = useState<any | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);

  // Booking Modal State
  const [bookingRide, setBookingRide] = useState<any | null>(null);
  const [bookingSeats, setBookingSeats] = useState<number>(1);
  const [pickupPlace, setPickupPlace] = useState<SelectedPlace | null>({
    address: '100 California Dr, Millbrae, CA',
    lat: 37.5997,
    lng: -122.3867,
  });
  const [pickupInput, setPickupInput] = useState<string>('100 California Dr, Millbrae, CA');
  const [pickupError, setPickupError] = useState<string | null>(null);

  const [dropPlace, setDropPlace] = useState<SelectedPlace | null>({
    address: '1600 Amphitheatre Pkwy, Mountain View, CA',
    lat: 37.422,
    lng: -122.0841,
  });
  const [dropInput, setDropInput] = useState<string>('1600 Amphitheatre Pkwy, Mountain View, CA');
  const [dropError, setDropError] = useState<string | null>(null);
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
    vehicle_type: 'CAR' as 'CAR' | 'MOTORCYCLE' | 'VAN',
  });

  // Publish Ride Modal State
  const [showPublishModal, setShowPublishModal] = useState<boolean>(false);
  const [newRideVehicleId, setNewRideVehicleId] = useState<string>('');
  const [newRideDepTime, setNewRideDepTime] = useState<string>(`${tomorrowStr}T08:30`);
  const [newRideSeats, setNewRideSeats] = useState<number>(3);
  const [newRideNotes, setNewRideNotes] = useState<string>('Smooth highway commute. AC on, quiet ride.');
  const [driverOrigin, setDriverOrigin] = useState<SelectedPlace | null>({
    address: '450 Dolores St, San Francisco, CA (SF Mission Dolores)',
    lat: 37.7615,
    lng: -122.426,
    placeId: 'preset-sf-mission',
  });
  const [driverOriginInput, setDriverOriginInput] = useState<string>(
    '450 Dolores St, San Francisco, CA (SF Mission Dolores)'
  );
  const [driverOriginError, setDriverOriginError] = useState<string | null>(null);

  const [driverDest, setDriverDest] = useState<SelectedPlace | null>({
    address: '1600 Amphitheatre Pkwy, Mountain View, CA (Acme HQ)',
    lat: 37.422,
    lng: -122.0841,
    placeId: 'preset-acme-hq',
  });
  const [driverDestInput, setDriverDestInput] = useState<string>(
    '1600 Amphitheatre Pkwy, Mountain View, CA (Acme HQ)'
  );
  const [driverDestError, setDriverDestError] = useState<string | null>(null);
  const [routeAlternatives, setRouteAlternatives] = useState<DirectionsRouteOption[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState<number>(0);
  const [fetchingRoutes, setFetchingRoutes] = useState<boolean>(false);
  const [isCustomizingRoute, setIsCustomizingRoute] = useState<boolean>(false);
  const [customStops, setCustomStops] = useState<
    Array<{ id: string; address: string; lat: number; lng: number; placeId?: string }>
  >([]);
  const [routePreferences, setRoutePreferences] = useState<{
    avoid_tolls: boolean;
    avoid_highways: boolean;
    avoid_ferries: boolean;
    routing_preference: 'FASTER' | 'SHORTER';
  }>({
    avoid_tolls: false,
    avoid_highways: false,
    avoid_ferries: false,
    routing_preference: 'FASTER',
  });
  const [newStopInput, setNewStopInput] = useState<string>('');
  const [newStopPlace, setNewStopPlace] = useState<SelectedPlace | null>(null);
  const [newStopError, setNewStopError] = useState<string | null>(null);
  const [showAddStopForm, setShowAddStopForm] = useState<boolean>(false);
  const [routeCalculationError, setRouteCalculationError] = useState<string | null>(null);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);

  // Admin Management State
  const [adminVehicles, setAdminVehicles] = useState<any[]>([]);
  const [adminVehiclesLoading, setAdminVehiclesLoading] = useState<boolean>(false);
  const [adminVehiclesError, setAdminVehiclesError] = useState<string | null>(null);
  const [deactivatingVehicleId, setDeactivatingVehicleId] = useState<string | null>(null);
  const [vehicleActionError, setVehicleActionError] = useState<string | null>(null);

  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [adminUsersLoading, setAdminUsersLoading] = useState<boolean>(false);
  const [adminUsersError, setAdminUsersError] = useState<string | null>(null);
  const [adminUserFilter, setAdminUserFilter] = useState<string>('ALL');
  const [adminUserSearch, setAdminUserSearch] = useState<string>('');

  // Invite Colleague State
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>('');
  const [inviteName, setInviteName] = useState<string>('');
  const [inviteDepartment, setInviteDepartment] = useState<string>('Engineering');
  const [inviteLocation, setInviteLocation] = useState<string>('Acme HQ');
  const [inviteCanDrive, setInviteCanDrive] = useState<boolean>(true);
  const [inviteLoading, setInviteLoading] = useState<boolean>(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [generatedInvitation, setGeneratedInvitation] = useState<{
    token: string;
    activationUrl: string;
    expiresAt: string;
    email: string;
  } | null>(null);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

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
    setActionFeedback(null);
    setSearchOriginError(null);
    setSearchDestError(null);

    // Reset previous search results and diagnostics immediately
    setSearchResults([]);
    setSearchDiagnostics(null);
    setHasSearched(false);

    let hasValidationError = false;
    if (
      !searchOrigin ||
      typeof searchOrigin.lat !== 'number' ||
      typeof searchOrigin.lng !== 'number' ||
      searchOrigin.address !== searchOriginInput
    ) {
      setSearchOriginError('Select a location from the search results.');
      hasValidationError = true;
    }

    if (
      !searchDestination ||
      typeof searchDestination.lat !== 'number' ||
      typeof searchDestination.lng !== 'number' ||
      searchDestination.address !== searchDestInput
    ) {
      setSearchDestError('Select a location from the search results.');
      hasValidationError = true;
    }

    if (hasValidationError || !searchOrigin || !searchDestination) {
      setActionFeedback({
        type: 'error',
        message: 'Select valid origin and destination locations from the search results.',
      });
      return;
    }

    setSearchLoading(true);
    try {
      const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      const [sYear, sMonth, sDay] = searchDate.split('-').map(Number);
      const localDayStart = new Date(sYear, sMonth - 1, sDay, 0, 0, 0, 0);
      const localDayNext = new Date(sYear, sMonth - 1, sDay + 1, 0, 0, 0, 0);

      const params = new URLSearchParams({
        origin_lat: searchOrigin.lat.toString(),
        origin_lng: searchOrigin.lng.toString(),
        dest_lat: searchDestination.lat.toString(),
        dest_lng: searchDestination.lng.toString(),
        date: searchDate,
        seats_needed: searchSeats.toString(),
        max_detour_meters: '3000',
        time_zone: timeZone,
        date_start_utc: localDayStart.toISOString(),
        date_end_utc: localDayNext.toISOString(),
      });

      if (searchWindowStart) {
        const [stH, stM] = searchWindowStart.split(':').map(Number);
        const startDate = new Date(sYear, sMonth - 1, sDay, stH || 0, stM || 0, 0, 0);
        params.set('window_start', startDate.toISOString());

        if (searchWindowEnd) {
          const [endH, endM] = searchWindowEnd.split(':').map(Number);
          let endDate = new Date(sYear, sMonth - 1, sDay, endH || 0, endM || 0, 0, 0);
          if (endDate.getTime() <= startDate.getTime()) {
            endDate = new Date(sYear, sMonth - 1, sDay + 1, endH || 0, endM || 0, 0, 0);
          }
          params.set('window_end', endDate.toISOString());
        }
      } else if (searchWindowEnd) {
        const [endH, endM] = searchWindowEnd.split(':').map(Number);
        const endDate = new Date(sYear, sMonth - 1, sDay, endH || 0, endM || 0, 0, 0);
        params.set('window_end', endDate.toISOString());
      }

      const res = await fetch(`/api/v1/rides/search?${params.toString()}`, {
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      setSearchResults(data.rides || []);
      setSearchDiagnostics(data.diagnostics || null);
      setHasSearched(true);
    } catch {
      setActionFeedback({ type: 'error', message: 'Failed to search corridor rides.' });
      setSearchDiagnostics(null);
    } finally {
      setSearchLoading(false);
    }
  };

  const fetchRouteAlternatives = async (
    overrideStops?: Array<{ id: string; address: string; lat: number; lng: number; placeId?: string }>,
    overridePrefs?: {
      avoid_tolls: boolean;
      avoid_highways: boolean;
      avoid_ferries: boolean;
      routing_preference: 'FASTER' | 'SHORTER';
    }
  ) => {
    setDriverOriginError(null);
    setDriverDestError(null);
    setRouteCalculationError(null);

    let hasValidationError = false;
    if (
      !driverOrigin ||
      typeof driverOrigin.lat !== 'number' ||
      typeof driverOrigin.lng !== 'number' ||
      driverOrigin.address !== driverOriginInput
    ) {
      setDriverOriginError('Select a location from the search results.');
      hasValidationError = true;
    }

    if (
      !driverDest ||
      typeof driverDest.lat !== 'number' ||
      typeof driverDest.lng !== 'number' ||
      driverDest.address !== driverDestInput
    ) {
      setDriverDestError('Select a location from the search results.');
      hasValidationError = true;
    }

    if (hasValidationError || !driverOrigin || !driverDest) {
      setActionFeedback({
        type: 'error',
        message: 'Select valid departure and destination locations from the search results before calculating routes.',
      });
      return;
    }

    const stopsToUse = overrideStops !== undefined ? overrideStops : customStops;
    const prefsToUse = overridePrefs !== undefined ? overridePrefs : routePreferences;

    setFetchingRoutes(true);
    try {
      const res = await fetch('/api/v1/routing/directions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          origin: {
            lat: driverOrigin.lat,
            lng: driverOrigin.lng,
            address: driverOrigin.address,
            place_id: driverOrigin.placeId,
          },
          destination: {
            lat: driverDest.lat,
            lng: driverDest.lng,
            address: driverDest.address,
            place_id: driverDest.placeId,
          },
          waypoints: stopsToUse.map((s, idx) => ({
            lat: s.lat,
            lng: s.lng,
            address: s.address,
            place_id: s.placeId,
            stop_order: idx + 1,
          })),
          alternatives: true,
          preferences: prefsToUse,
        }),
      });

      const data = await res.json();
      if (res.ok && data.routes && data.routes.length > 0) {
        setRouteAlternatives(data.routes);
        setSelectedRouteIdx(0);
        setRouteCalculationError(null);
      } else {
        const errorMsg = data.detail || data.title || 'No route alternatives found for the selected stops and preferences.';
        setRouteCalculationError(errorMsg);
        setRouteAlternatives([]);
      }
    } catch {
      setRouteCalculationError('Network error while calculating routes.');
      setRouteAlternatives([]);
    } finally {
      setFetchingRoutes(false);
    }
  };

  const handleAddCustomStop = () => {
    if (!newStopPlace || !newStopPlace.address) {
      setNewStopError('Search and select a valid location from the results.');
      return;
    }
    const newStop = {
      id: crypto.randomUUID ? crypto.randomUUID() : `stop_${Date.now()}`,
      address: newStopPlace.address,
      lat: newStopPlace.lat,
      lng: newStopPlace.lng,
      placeId: newStopPlace.placeId,
    };
    const updated = [...customStops, newStop];
    setCustomStops(updated);
    setNewStopInput('');
    setNewStopPlace(null);
    setNewStopError(null);
    setShowAddStopForm(false);
    fetchRouteAlternatives(updated);
  };

  const handleRemoveCustomStop = (stopId: string) => {
    const updated = customStops.filter((s) => s.id !== stopId);
    setCustomStops(updated);
    fetchRouteAlternatives(updated);
  };

  const handleMoveStopUp = (index: number) => {
    if (index === 0) return;
    const updated = [...customStops];
    const temp = updated[index - 1];
    updated[index - 1] = updated[index];
    updated[index] = temp;
    setCustomStops(updated);
    fetchRouteAlternatives(updated);
  };

  const handleMoveStopDown = (index: number) => {
    if (index >= customStops.length - 1) return;
    const updated = [...customStops];
    const temp = updated[index + 1];
    updated[index + 1] = updated[index];
    updated[index] = temp;
    setCustomStops(updated);
    fetchRouteAlternatives(updated);
  };

  const handleTogglePreference = (key: 'avoid_tolls' | 'avoid_highways' | 'avoid_ferries') => {
    const updated = {
      ...routePreferences,
      [key]: !routePreferences[key],
    };
    setRoutePreferences(updated);
    fetchRouteAlternatives(undefined, updated);
  };

  const handleSetRoutingPreference = (pref: 'FASTER' | 'SHORTER') => {
    const updated = {
      ...routePreferences,
      routing_preference: pref,
    };
    setRoutePreferences(updated);
    fetchRouteAlternatives(undefined, updated);
  };

  const handleMapClickAddStop = (coords: { lat: number; lng: number }) => {
    if (!isCustomizingRoute) return;
    const addr = `Custom Stop (${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)})`;
    const newStop = {
      id: crypto.randomUUID ? crypto.randomUUID() : `stop_${Date.now()}`,
      address: addr,
      lat: coords.lat,
      lng: coords.lng,
    };
    const updated = [...customStops, newStop];
    setCustomStops(updated);
    fetchRouteAlternatives(updated);
  };

  const fetchBookings = async () => {
    try {
      const res = await fetch('/api/v1/rides?role=rider', {
        headers: { ...getAuthHeaders() },
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
        headers: { ...getAuthHeaders() },
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
        headers: { ...getAuthHeaders() },
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
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      setAuditLogs(data.logs || []);
    } catch {
      // ignore
    }
  };

  const fetchAdminVehicles = async () => {
    setAdminVehiclesLoading(true);
    setAdminVehiclesError(null);
    try {
      const res = await fetch('/api/v1/admin/vehicles', {
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      if (res.ok) {
        setAdminVehicles(data.vehicles || []);
      } else {
        setAdminVehiclesError(data.detail || data.title || 'Failed to load organization vehicles.');
      }
    } catch {
      setAdminVehiclesError('Network error loading vehicles.');
    } finally {
      setAdminVehiclesLoading(false);
    }
  };

  const fetchAdminUsers = async (statusFilter?: string, querySearch?: string) => {
    setAdminUsersLoading(true);
    setAdminUsersError(null);
    try {
      const params = new URLSearchParams();
      const status = statusFilter !== undefined ? statusFilter : adminUserFilter;
      if (status && status !== 'ALL') {
        params.set('status', status);
      }
      const q = querySearch !== undefined ? querySearch : adminUserSearch;
      if (q && q.trim()) {
        params.set('q', q.trim());
      }
      const res = await fetch(`/api/v1/admin/users?${params.toString()}`, {
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      if (res.ok) {
        setAdminUsers(data.users || []);
      } else {
        setAdminUsersError(data.detail || data.title || 'Failed to load organization users.');
      }
    } catch {
      setAdminUsersError('Network error loading users.');
    } finally {
      setAdminUsersLoading(false);
    }
  };

  const handleDeactivateVehicle = async (vehicleId: string) => {
    if (!window.confirm('Are you sure you want to deactivate this vehicle? It will no longer be eligible for publishing new carpool rides.')) {
      return;
    }
    setDeactivatingVehicleId(vehicleId);
    setVehicleActionError(null);
    try {
      const res = await fetch(`/api/v1/admin/vehicles/${vehicleId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      if (res.ok) {
        setActionFeedback({ type: 'success', message: 'Vehicle successfully deactivated.' });
        await fetchAdminVehicles();
        await fetchAuditLogs();
      } else {
        setVehicleActionError(data.detail || data.title || 'Failed to deactivate vehicle.');
      }
    } catch {
      setVehicleActionError('Network error while deactivating vehicle.');
    } finally {
      setDeactivatingVehicleId(null);
    }
  };

  useEffect(() => {
    // Auth guard — redirect unauthenticated users to login
    if (!isAuthenticated()) {
      window.location.href = '/login';
      return;
    }
    // Initialize identity from stored JWT user
    const storedUser = getStoredUser();
    if (storedUser) {
      setActiveUserId(storedUser.id);
      setCurrentUserName(storedUser.full_name);
    }

    // Validate capabilities directly with server — authoritative database capability check
    fetch('/api/v1/me', { headers: { ...getAuthHeaders() } })
      .then((res) => {
        if (res.status === 401) {
          clearStoredAuth();
          window.location.href = '/login';
          return null;
        }
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (data) {
          const admin = Boolean(data.capabilities?.is_org_admin);
          setIsOrgAdmin(admin);
          if (data.id) setActiveUserId(data.id);
          if (data.full_name) setCurrentUserName(data.full_name);
          if (!admin && activeTab === 'audit') {
            setActiveTab('search');
          }
        } else {
          // Default to normal-user access if capabilities cannot be resolved
          setIsOrgAdmin(false);
          if (activeTab === 'audit') {
            setActiveTab('search');
          }
        }
      })
      .catch(() => {
        // Fallback safely to normal-user access on network or parsing error
        setIsOrgAdmin(false);
        if (activeTab === 'audit') {
          setActiveTab('search');
        }
      });

    if (activeTab === 'search') runSearch();
    if (activeTab === 'bookings') fetchBookings();
    if (activeTab === 'driver') fetchDriverRides();
    if (activeTab === 'vehicles') fetchVehicles();
    if (activeTab === 'audit') {
      if (isOrgAdmin) {
        fetchAuditLogs();
        fetchAdminVehicles();
        fetchAdminUsers();
      } else {
        setActiveTab('search');
      }
    }
  }, [activeTab]);

  // --------------------------------------------------------------------------
  // Action Handlers (Rider & Driver)
  // --------------------------------------------------------------------------

  // Rider submits request
  const submitSeatRequest = async () => {
    if (!bookingRide) return;
    setPickupError(null);
    setDropError(null);

    let hasBookingValError = false;
    if (
      !pickupPlace ||
      typeof pickupPlace.lat !== 'number' ||
      typeof pickupPlace.lng !== 'number' ||
      pickupPlace.address !== pickupInput
    ) {
      setPickupError('Select a location from the search results.');
      hasBookingValError = true;
    }

    if (
      !dropPlace ||
      typeof dropPlace.lat !== 'number' ||
      typeof dropPlace.lng !== 'number' ||
      dropPlace.address !== dropInput
    ) {
      setDropError('Select a location from the search results.');
      hasBookingValError = true;
    }

    if (hasBookingValError || !pickupPlace || !dropPlace) {
      return;
    }

    try {
      const res = await fetch(`/api/v1/rides/${bookingRide.ride.id}/requests`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          requested_seats: bookingSeats,
          rider_note: bookingNote,
          pickup_point: {
            address_text: pickupPlace!.address,
            latitude: pickupPlace!.lat,
            longitude: pickupPlace!.lng,
            landmark_note: 'Passenger designated pickup point along driver corridor',
          },
          drop_point: {
            address_text: dropPlace!.address,
            latitude: dropPlace!.lat,
            longitude: dropPlace!.lng,
            landmark_note: 'Corporate destination drop point',
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
        headers: { ...getAuthHeaders() },
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
          ...getAuthHeaders(),
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
          ...getAuthHeaders(),
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
      headers: { ...getAuthHeaders() },
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
      headers: { ...getAuthHeaders() },
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
        ...getAuthHeaders(),
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
        ...getAuthHeaders(),
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
    setDriverOriginError(null);
    setDriverDestError(null);

    let hasValidationError = false;
    if (
      !driverOrigin ||
      typeof driverOrigin.lat !== 'number' ||
      typeof driverOrigin.lng !== 'number' ||
      driverOrigin.address !== driverOriginInput
    ) {
      setDriverOriginError('Select a location from the search results.');
      hasValidationError = true;
    }

    if (
      !driverDest ||
      typeof driverDest.lat !== 'number' ||
      typeof driverDest.lng !== 'number' ||
      driverDest.address !== driverDestInput
    ) {
      setDriverDestError('Select a location from the search results.');
      hasValidationError = true;
    }

    if (hasValidationError || !driverOrigin || !driverDest) {
      setActionFeedback({
        type: 'error',
        message: 'Select valid departure and destination locations from the search results.',
      });
      return;
    }

    if (!newRideVehicleId) {
      alert('Please select a vehicle.');
      return;
    }

    if (!routeAlternatives || routeAlternatives.length === 0) {
      setActionFeedback({
        type: 'error',
        message: 'Please calculate route options and select a route before publishing.',
      });
      return;
    }

    const selectedRoute = routeAlternatives[selectedRouteIdx] || routeAlternatives[0];
    if (!selectedRoute) {
      setActionFeedback({
        type: 'error',
        message: 'Selected route is invalid. Please recalculate route options.',
      });
      return;
    }

    const distMeters = selectedRoute.total_distance_meters || selectedRoute.distance || 0;
    const durSecs = selectedRoute.total_duration_seconds || selectedRoute.duration || 0;
    const waypoints = selectedRoute.waypoints || [];

    const payload = {
      vehicle_id: newRideVehicleId,
      departure_time: new Date(newRideDepTime).toISOString(),
      arrival_time_estimated: new Date(new Date(newRideDepTime).getTime() + durSecs * 1000).toISOString(),
      total_seats_offered: newRideSeats,
      cost_per_seat_cents: 350,
      notes: newRideNotes,
      route: {
        origin_address: driverOrigin.address,
        origin_latitude: driverOrigin.lat,
        origin_longitude: driverOrigin.lng,
        destination_address: driverDest.address,
        destination_latitude: driverDest.lat,
        destination_longitude: driverDest.lng,
        total_distance_meters: distMeters,
        total_duration_seconds: durSecs,
        encoded_polyline: selectedRoute.encoded_polyline,
        google_route_id: selectedRoute.route_id,
        waypoints,
      },
    };

    const res = await fetch('/api/v1/rides', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeaders(),
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

  const handleInviteEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteLoading(true);
    setInviteError(null);
    try {
      const res = await fetch('/api/v1/admin/users/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          full_name: inviteName.trim(),
          work_department: inviteDepartment.trim(),
          work_location: inviteLocation.trim(),
          can_drive: inviteCanDrive,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || data.title || 'Failed to invite employee');
      }
      const rawToken = data.invitation?.token;
      const activationUrl = `${window.location.origin}/activate?token=${rawToken}`;
      setGeneratedInvitation({
        token: rawToken,
        activationUrl,
        expiresAt: data.invitation?.expires_at,
        email: inviteEmail.trim(),
      });
      fetchAuditLogs();
      fetchAdminUsers();
    } catch (err: any) {
      setInviteError(err.message || 'Failed to generate invitation');
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        currentUserName={currentUserName}
        activeUserId={activeUserId}
        isOrgAdmin={isOrgAdmin}
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab === 'audit' && !isOrgAdmin) {
            setActiveTab('search');
            return;
          }
          setActiveTab(tab);
        }}
        onLogout={() => { clearStoredAuth(); window.location.href = '/login'; }}
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

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                <div className="md:col-span-4">
                  <PlaceAutocompleteInput
                    label="Origin / Boarding Hub"
                    placeholder="Search an address, landmark, business, or transit stop"
                    value={searchOriginInput}
                    selectedPlace={searchOrigin}
                    onChange={(addr) => {
                      setSearchOriginInput(addr);
                      setSearchOrigin(null);
                      if (searchOriginError) setSearchOriginError(null);
                    }}
                    onSelectPlace={(place) => {
                      setSearchOrigin(place);
                      setSearchOriginInput(place.address);
                      setSearchOriginError(null);
                    }}
                    onClearSelection={() => setSearchOrigin(null)}
                    error={searchOriginError}
                  />
                </div>

                <div className="md:col-span-4">
                  <PlaceAutocompleteInput
                    label="Corporate Destination"
                    placeholder="Search an address, landmark, business, or campus"
                    value={searchDestInput}
                    selectedPlace={searchDestination}
                    onChange={(addr) => {
                      setSearchDestInput(addr);
                      setSearchDestination(null);
                      if (searchDestError) setSearchDestError(null);
                    }}
                    onSelectPlace={(place) => {
                      setSearchDestination(place);
                      setSearchDestInput(place.address);
                      setSearchDestError(null);
                    }}
                    onClearSelection={() => setSearchDestination(null)}
                    error={searchDestError}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Commute Date
                  </label>
                  <input
                    type="date"
                    value={searchDate}
                    onChange={(e) => setSearchDate(e.target.value)}
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <button
                    onClick={runSearch}
                    disabled={searchLoading}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold py-2.5 rounded-lg text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-emerald-600/20 disabled:opacity-50"
                  >
                    <Search className="w-4 h-4" />
                    {searchLoading ? 'Matching...' : 'Find Matches'}
                  </button>
                </div>
              </div>

              {/* Advanced Departure Time Window Filter */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span className="font-semibold text-slate-300">Departure Time Window:</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="time"
                      value={searchWindowStart}
                      onChange={(e) => setSearchWindowStart(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:border-emerald-500"
                    />
                    <span>to</span>
                    <input
                      type="time"
                      value={searchWindowEnd}
                      onChange={(e) => setSearchWindowEnd(e.target.value)}
                      className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span>Seats needed:</span>
                  <select
                    value={searchSeats}
                    onChange={(e) => setSearchSeats(Number(e.target.value))}
                    className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-xs focus:border-emerald-500"
                  >
                    <option value={1}>1 Seat</option>
                    <option value={2}>2 Seats</option>
                    <option value={3}>3 Seats</option>
                  </select>
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
                  {(() => {
                    if (searchDiagnostics) {
                      if (searchDiagnostics.total_scheduled_rides_in_org === 0) {
                        return (
                          <>
                            <h3 className="text-base font-semibold text-white mb-1">
                              No scheduled rides exist in your organization.
                            </h3>
                            <p className="text-xs max-w-md mx-auto mb-3">
                              No active carpool commutes are currently scheduled. Be the first to publish a ride on the Host Commutes tab!
                            </p>
                          </>
                        );
                      }
                      if (searchDiagnostics.rides_matching_date === 0) {
                        return (
                          <>
                            <h3 className="text-base font-semibold text-white mb-1">
                              No scheduled rides exist for this date.
                            </h3>
                            <p className="text-xs max-w-md mx-auto mb-3">
                              There are scheduled rides on other dates, but none departing on {searchDate}. Try selecting another commute date.
                            </p>
                          </>
                        );
                      }
                      if (searchDiagnostics.rides_matching_seats === 0) {
                        return (
                          <>
                            <h3 className="text-base font-semibold text-white mb-1">
                              No rides have enough available seats.
                            </h3>
                            <p className="text-xs max-w-md mx-auto mb-3">
                              Rides are scheduled on this date, but none have {searchSeats} seat(s) available. Try searching for fewer seats.
                            </p>
                          </>
                        );
                      }
                      if (searchDiagnostics.rides_matching_corridor === 0) {
                        return (
                          <>
                            <h3 className="text-base font-semibold text-white mb-1">
                              No rides pass the pickup and destination corridor.
                            </h3>
                            <p className="text-xs max-w-md mx-auto mb-3">
                              No active rides pass both your pickup and dropoff corridor within the allowed 3,000m detour threshold. Try selecting nearby transit hubs or campus locations.
                            </p>
                          </>
                        );
                      }
                      if (searchDiagnostics.rides_matching_time_window === 0) {
                        return (
                          <>
                            <h3 className="text-base font-semibold text-white mb-1">
                              Rides exist, but none depart within the selected local time window.
                            </h3>
                            <p className="text-xs max-w-md mx-auto mb-3">
                              Commutes are scheduled along your route on this date, but their departure times fall outside your selected local time window. Try widening or clearing the departure window.
                            </p>
                          </>
                        );
                      }
                    }
                    return (
                      <>
                        <h3 className="text-base font-semibold text-white mb-1">
                          No rides matched this search.
                        </h3>
                        <p className="text-xs max-w-md mx-auto mb-3">
                          Try adjusting your commute date, clearing the departure time window, or broadening your corridor.
                        </p>
                      </>
                    );
                  })()}
                  {searchDiagnostics && (
                    <div className="inline-flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-400 bg-slate-950/60 border border-slate-800 px-3 py-1.5 rounded-lg mt-2">
                      <span>Total Org Rides: <strong className="text-slate-200">{searchDiagnostics.total_scheduled_rides_in_org ?? 0}</strong></span>
                      &bull;
                      <span>Date Matches: <strong className="text-slate-200">{searchDiagnostics.rides_matching_date ?? 0}</strong></span>
                      &bull;
                      <span>Seat Matches: <strong className="text-slate-200">{searchDiagnostics.rides_matching_seats ?? 0}</strong></span>
                      &bull;
                      <span>Corridor Matches: <strong className="text-slate-200">{searchDiagnostics.rides_matching_corridor ?? 0}</strong></span>
                      {searchDiagnostics.rides_matching_time_window !== undefined && (
                        <>
                          &bull;
                          <span>Time Window Matches: <strong className="text-slate-200">{searchDiagnostics.rides_matching_time_window}</strong></span>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {searchResults.map((match) => {
                const { ride, driver, vehicle, route, waypoints, nearestPickupDistanceMeters } = match;

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

                    {/* Proximity Pill, Match Score & Vehicle Details */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs bg-slate-950/50 p-3 rounded-xl border border-slate-800">
                      <div className="flex items-center gap-2 text-slate-300">
                        <Car className="w-4 h-4 text-emerald-400" />
                        <span>
                          {vehicle.make} {vehicle.model} ({vehicle.color}) &bull; Plate:{' '}
                          <strong className="text-white">{vehicle.license_plate}</strong>
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-emerald-400 font-medium">
                        <Navigation className="w-4 h-4" />
                        <span>Pickup detour: {nearestPickupDistanceMeters}m</span>
                      </div>
                      <div className="flex items-center gap-2 text-cyan-400 font-medium">
                        <span>Score: <strong>{match.match_score ?? 'N/A'}</strong></span>
                        {match.delta_departure_minutes !== undefined && (
                          <span className="text-[10px] text-slate-400">({match.delta_departure_minutes}m time delta)</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-slate-300 justify-end">
                        <span>Cost share:</span>
                        <strong className="text-white">${(ride.cost_per_seat_cents / 100).toFixed(2)}</strong>
                      </div>
                    </div>

                    {/* Interactive Google Maps / Vector Route Viewer */}
                    <GoogleMapViewer
                      route={route}
                      waypoints={waypoints}
                      pickupPoint={{
                        latitude: searchOrigin ? searchOrigin.lat : 37.5997,
                        longitude: searchOrigin ? searchOrigin.lng : -122.3867,
                        address: searchOrigin ? searchOrigin.address : '',
                      }}
                      dropPoint={{
                        latitude: searchDestination ? searchDestination.lat : 37.422,
                        longitude: searchDestination ? searchDestination.lng : -122.0841,
                        address: searchDestination ? searchDestination.address : '',
                      }}
                    />

                    {/* Card Actions */}
                    <div className="flex items-center justify-between pt-2">
                      <span className="text-xs text-slate-400 italic">
                        &ldquo;{ride.notes || 'Direct campus commute.'}&rdquo;
                      </span>

                      <button
                        onClick={() => {
                          setBookingRide(match);
                          setPickupPlace(searchOrigin);
                          setPickupInput(searchOrigin ? searchOrigin.address : '');
                          setPickupError(null);
                          setDropPlace(searchDestination);
                          setDropInput(searchDestination ? searchDestination.address : '');
                          setDropError(null);
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
                  <PlaceAutocompleteInput
                    label="Your Exact Boarding Point (Pickup Address)"
                    placeholder="Search an address, landmark, business, or transit stop"
                    value={pickupInput}
                    selectedPlace={pickupPlace}
                    onChange={(addr) => {
                      setPickupInput(addr);
                      if (pickupPlace && pickupPlace.address !== addr) {
                        setPickupPlace(null);
                      }
                      if (pickupError) setPickupError(null);
                    }}
                    onSelectPlace={(place) => {
                      setPickupPlace(place);
                      setPickupInput(place.address);
                      setPickupError(null);
                    }}
                    onClearSelection={() => setPickupPlace(null)}
                    error={pickupError}
                  />
                </div>

                <div>
                  <PlaceAutocompleteInput
                    label="Your Destination (Drop Address)"
                    placeholder="Search an address, landmark, business, or campus"
                    value={dropInput}
                    selectedPlace={dropPlace}
                    onChange={(addr) => {
                      setDropInput(addr);
                      if (dropPlace && dropPlace.address !== addr) {
                        setDropPlace(null);
                      }
                      if (dropError) setDropError(null);
                    }}
                    onSelectPlace={(place) => {
                      setDropPlace(place);
                      setDropInput(place.address);
                      setDropError(null);
                    }}
                    onClearSelection={() => setDropPlace(null)}
                    error={dropError}
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
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
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

              <form onSubmit={handlePublishRide} className="space-y-4">
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

                {/* Route Configuration & Calculation */}
                <div className="space-y-3 pt-3 border-t border-slate-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-emerald-400">Commute Route & Navigation</span>
                      {customStops.length > 0 && (
                        <span className="bg-cyan-900/60 border border-cyan-700/60 text-cyan-300 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                          {customStops.length} Custom Stop{customStops.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setIsCustomizingRoute(!isCustomizingRoute)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1 transition border ${
                          isCustomizingRoute
                            ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300'
                            : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                        }`}
                      >
                        <svg className="w-3 h-3 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                        </svg>
                        {isCustomizingRoute ? 'Hide Customizer' : 'Customize Route'}
                      </button>
                      <button
                        type="button"
                        onClick={() => fetchRouteAlternatives()}
                        disabled={fetchingRoutes}
                        className="text-[11px] bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold px-3 py-1 rounded-lg flex items-center gap-1 transition shadow disabled:opacity-50"
                      >
                        <Navigation className="w-3 h-3" />
                        {fetchingRoutes ? 'Calculating...' : 'Calculate Routes'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <PlaceAutocompleteInput
                      label="Driver Departure Origin"
                      placeholder="Search an address, landmark, business, or transit stop"
                      value={driverOriginInput}
                      selectedPlace={driverOrigin}
                      onChange={(addr) => {
                        setDriverOriginInput(addr);
                        if (driverOrigin && driverOrigin.address !== addr) {
                          setDriverOrigin(null);
                        }
                        if (driverOriginError) setDriverOriginError(null);
                      }}
                      onSelectPlace={(place) => {
                        setDriverOrigin(place);
                        setDriverOriginInput(place.address);
                        setDriverOriginError(null);
                      }}
                      onClearSelection={() => setDriverOrigin(null)}
                      error={driverOriginError}
                    />
                    <PlaceAutocompleteInput
                      label="Driver Final Destination"
                      placeholder="Search an address, landmark, business, or campus"
                      value={driverDestInput}
                      selectedPlace={driverDest}
                      onChange={(addr) => {
                        setDriverDestInput(addr);
                        if (driverDest && driverDest.address !== addr) {
                          setDriverDest(null);
                        }
                        if (driverDestError) setDriverDestError(null);
                      }}
                      onSelectPlace={(place) => {
                        setDriverDest(place);
                        setDriverDestInput(place.address);
                        setDriverDestError(null);
                      }}
                      onClearSelection={() => setDriverDest(null)}
                      error={driverDestError}
                    />
                  </div>

                  {/* Route Customization Drawer */}
                  {isCustomizingRoute && (
                    <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                          <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                          </svg>
                          Route Preferences & Intermediate Waypoints
                        </span>
                        <span className="text-[10px] text-slate-400">
                          Max 8 intermediate stops
                        </span>
                      </div>

                      {/* Avoid Preferences & Priority */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="flex items-center gap-1.5 text-slate-300 text-[11px] cursor-pointer bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg hover:border-slate-700">
                            <input
                              type="checkbox"
                              checked={routePreferences.avoid_tolls}
                              onChange={() => handleTogglePreference('avoid_tolls')}
                              className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                            />
                            Avoid Tolls
                          </label>
                          <label className="flex items-center gap-1.5 text-slate-300 text-[11px] cursor-pointer bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg hover:border-slate-700">
                            <input
                              type="checkbox"
                              checked={routePreferences.avoid_highways}
                              onChange={() => handleTogglePreference('avoid_highways')}
                              className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                            />
                            Avoid Highways
                          </label>
                          <label className="flex items-center gap-1.5 text-slate-300 text-[11px] cursor-pointer bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg hover:border-slate-700">
                            <input
                              type="checkbox"
                              checked={routePreferences.avoid_ferries}
                              onChange={() => handleTogglePreference('avoid_ferries')}
                              className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                            />
                            Avoid Ferries
                          </label>
                        </div>
                        <div className="flex items-center sm:justify-end gap-1 text-[11px]">
                          <span className="text-slate-400 mr-1">Priority:</span>
                          <button
                            type="button"
                            onClick={() => handleSetRoutingPreference('FASTER')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition ${
                              routePreferences.routing_preference === 'FASTER'
                                ? 'bg-emerald-950 border border-emerald-500 text-emerald-300'
                                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-300'
                            }`}
                          >
                            Fastest Time
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSetRoutingPreference('SHORTER')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition ${
                              routePreferences.routing_preference === 'SHORTER'
                                ? 'bg-emerald-950 border border-emerald-500 text-emerald-300'
                                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-300'
                            }`}
                          >
                            Shortest Distance
                          </button>
                        </div>
                      </div>

                      {/* Intermediate Stops List */}
                      <div className="space-y-2 pt-1 border-t border-slate-800/80">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-300">
                            Intermediate Stops Along Corridor:
                          </span>
                          {!showAddStopForm && (
                            <button
                              type="button"
                              onClick={() => setShowAddStopForm(true)}
                              disabled={customStops.length >= 8}
                              className="text-[10px] bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 px-2 py-0.5 rounded flex items-center gap-1 transition disabled:opacity-50"
                            >
                              <Plus className="w-3 h-3" />
                              Add Stop
                            </button>
                          )}
                        </div>

                        {customStops.length === 0 ? (
                          <div className="text-[11px] text-slate-500 italic bg-slate-900/50 p-2.5 rounded-lg border border-slate-800/60 flex items-center justify-between">
                            <span>No intermediate stops added yet. The route will be direct from origin to destination.</span>
                            <span className="text-[10px] text-cyan-400/80 ml-2 hidden sm:inline">
                              Tip: Click on the map below to add stops
                            </span>
                          </div>
                        ) : (
                          <div className="space-y-1.5 max-h-40 overflow-y-auto">
                            {customStops.map((stop, idx) => (
                              <div
                                key={stop.id}
                                className="bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 flex items-center justify-between text-xs"
                              >
                                <div className="flex items-center gap-2 overflow-hidden mr-2">
                                  <span className="w-5 h-5 rounded-full bg-cyan-950 border border-cyan-500/60 text-cyan-300 text-[10px] font-bold flex items-center justify-center shrink-0">
                                    {idx + 1}
                                  </span>
                                  <span className="text-slate-200 text-[11px] truncate" title={stop.address}>
                                    {stop.address}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => handleMoveStopUp(idx)}
                                    disabled={idx === 0}
                                    title="Move stop up"
                                    className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleMoveStopDown(idx)}
                                    disabled={idx === customStops.length - 1}
                                    title="Move stop down"
                                    className="p-1 text-slate-400 hover:text-white disabled:opacity-30"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveCustomStop(stop.id)}
                                    title="Remove stop"
                                    className="p-1 text-red-400 hover:text-red-300"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add Stop Form */}
                        {showAddStopForm && (
                          <div className="bg-slate-900/90 border border-cyan-800/40 rounded-xl p-3 space-y-2.5 mt-2">
                            <PlaceAutocompleteInput
                              label="Add Intermediate Pickup / Landmark Stop"
                              placeholder="Search address or business to add as a corridor stop"
                              value={newStopInput}
                              selectedPlace={newStopPlace}
                              onChange={(addr) => {
                                setNewStopInput(addr);
                                if (newStopError) setNewStopError(null);
                              }}
                              onSelectPlace={(place) => {
                                setNewStopPlace(place);
                                setNewStopInput(place.address);
                                setNewStopError(null);
                              }}
                              onClearSelection={() => setNewStopPlace(null)}
                              error={newStopError}
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setShowAddStopForm(false);
                                  setNewStopInput('');
                                  setNewStopPlace(null);
                                  setNewStopError(null);
                                }}
                                className="px-2.5 py-1 text-[11px] text-slate-400 hover:text-white"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={handleAddCustomStop}
                                className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-semibold px-3 py-1 rounded-lg text-[11px] transition shadow"
                              >
                                Confirm Stop & Recalculate
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Route Calculation Error Banner */}
                  {routeCalculationError && (
                    <div className="bg-red-950/60 border border-red-800 rounded-xl p-3 flex items-start gap-2 text-xs text-red-300">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <div>
                        <strong>Route Calculation Error: </strong>
                        {routeCalculationError}
                      </div>
                    </div>
                  )}

                  {/* Route Alternatives Selection Cards */}
                  {routeAlternatives.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="block text-[11px] font-semibold text-slate-300">
                          Route Options (Google Maps Alternatives):
                        </label>
                        <span className="text-[10px] text-slate-400">
                          Click card or polyline on map to select
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {routeAlternatives.map((alt, idx) => {
                          const isSelected = selectedRouteIdx === idx;
                          const hasTolls = Boolean(alt.toll_metadata?.has_tolls);
                          const hasHighways = alt.has_highways;
                          const hasFerries = alt.has_ferries;
                          const isFastest = alt.is_recommended || idx === 0;

                          return (
                            <div
                              key={alt.route_id || idx}
                              onClick={() => setSelectedRouteIdx(idx)}
                              className={`p-3 rounded-xl border text-xs cursor-pointer transition relative flex flex-col justify-between ${
                                isSelected
                                  ? 'bg-emerald-950/40 border-emerald-500 shadow-md shadow-emerald-950/50'
                                  : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <div className="space-y-1.5">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="font-bold text-white text-xs leading-snug">
                                    {alt.summary || `Route Alternative ${idx + 1}`}
                                  </div>
                                  {isSelected && (
                                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                  )}
                                </div>

                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-emerald-400 font-bold text-xs">
                                    {alt.formatted_duration || `${Math.round(alt.total_duration_seconds / 60)} mins`}
                                  </span>
                                  <span className="text-slate-400 text-[11px]">
                                    {alt.formatted_distance || `${(alt.total_distance_meters / 1000).toFixed(1)} km`}
                                  </span>
                                  {alt.formatted_traffic_duration && alt.formatted_traffic_duration !== alt.formatted_duration && (
                                    <span className="text-amber-300/90 text-[10px]">
                                      ({alt.formatted_traffic_duration} in traffic)
                                    </span>
                                  )}
                                </div>

                                {/* Feature Badges */}
                                <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                  {isFastest && (
                                    <span className="bg-emerald-900/60 border border-emerald-700/60 text-emerald-300 text-[9px] font-semibold px-1.5 py-0.5 rounded">
                                      ⭐ Recommended
                                    </span>
                                  )}
                                  {hasTolls && (
                                    <span className="bg-amber-950/60 border border-amber-800/60 text-amber-300 text-[9px] font-medium px-1.5 py-0.5 rounded">
                                      ⚠️ Tolls
                                    </span>
                                  )}
                                  {hasHighways && (
                                    <span className="bg-blue-950/60 border border-blue-800/60 text-blue-300 text-[9px] font-medium px-1.5 py-0.5 rounded">
                                      🛣️ Highways
                                    </span>
                                  )}
                                  {hasFerries && (
                                    <span className="bg-cyan-950/60 border border-cyan-800/60 text-cyan-300 text-[9px] font-medium px-1.5 py-0.5 rounded">
                                      ⛴️ Ferry
                                    </span>
                                  )}
                                </div>

                                {alt.warnings && alt.warnings.length > 0 && (
                                  <div className="text-[10px] text-amber-400/90 italic pt-0.5 line-clamp-1">
                                    {alt.warnings[0]}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* Interactive Google Map Preview */}
                      <div className="space-y-1 pt-1">
                        <GoogleMapViewer
                          origin={{
                            latitude: driverOrigin?.lat ?? 37.7615,
                            longitude: driverOrigin?.lng ?? -122.426,
                            address: driverOrigin?.address ?? 'Departure Origin',
                          }}
                          destination={{
                            latitude: driverDest?.lat ?? 37.422,
                            longitude: driverDest?.lng ?? -122.0841,
                            address: driverDest?.address ?? 'Destination',
                          }}
                          routes={routeAlternatives}
                          selectedRouteIdx={selectedRouteIdx}
                          selectedRouteId={routeAlternatives[selectedRouteIdx]?.route_id}
                          onSelectRoute={(_id, idx) => setSelectedRouteIdx(idx)}
                          onMapClick={isCustomizingRoute ? handleMapClickAddStop : undefined}
                          waypoints={
                            routeAlternatives[selectedRouteIdx]?.waypoints ||
                            customStops.map((s, idx) => ({
                              stop_order: idx + 1,
                              latitude: s.lat,
                              longitude: s.lng,
                              address_text: s.address,
                            }))
                          }
                          height="260px"
                        />
                        <div className="flex items-center justify-between text-[10px] text-slate-500 px-1">
                          <span>Click directly on route lines on the map to toggle between alternatives</span>
                          {isCustomizingRoute && (
                            <span className="text-cyan-400">Map click adds waypoint at clicked coordinates</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
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
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white text-base">
                              {v.year} {v.make} {v.model}
                            </span>
                            <span className="text-[10px] bg-slate-800 border border-slate-700 text-emerald-400 px-2 py-0.5 rounded font-semibold">
                              {v.vehicle_type || 'CAR'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            Color: <strong className="text-slate-200">{v.color}</strong> &bull; Total Seats:{' '}
                            <strong className="text-slate-200">{v.total_seats}</strong> (max {v.max_passenger_capacity || Math.max(1, v.total_seats - 1)} passenger{v.total_seats > 2 ? 's' : ''})
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
                  <div>
                    <label className="block text-slate-400 mb-1">Vehicle Classification</label>
                    <select
                      value={newVehicle.vehicle_type}
                      onChange={(e) => {
                        const type = e.target.value as 'CAR' | 'MOTORCYCLE' | 'VAN';
                        const defaultSeats = type === 'MOTORCYCLE' ? 2 : type === 'VAN' ? 7 : 5;
                        setNewVehicle({ ...newVehicle, vehicle_type: type, total_seats: defaultSeats });
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-white"
                    >
                      <option value="CAR">Standard Passenger Car (2-8 seats)</option>
                      <option value="MOTORCYCLE">Motorcycle / Scooter (1-2 seats, 1 passenger max)</option>
                      <option value="VAN">Corporate Van / Shuttle (5-15 seats)</option>
                    </select>
                  </div>

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
                        min={newVehicle.vehicle_type === 'MOTORCYCLE' ? 1 : 2}
                        max={newVehicle.vehicle_type === 'MOTORCYCLE' ? 2 : 15}
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
        {/* TAB 5: COMPLIANCE & AUDIT (Admin Console & Governance)            */}
        {/* ================================================================= */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            {!isOrgAdmin ? (
              <div className="bg-slate-900 border border-rose-800/40 rounded-2xl p-12 text-center space-y-4 shadow-xl">
                <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                  <Shield className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Administrative Access Required</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    This administration console and tenant management view is restricted to organization administrators. Non-admin access is strictly prohibited.
                  </p>
                </div>
                <button
                  onClick={() => setActiveTab('search')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl transition"
                >
                  Return to Ride Search
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                      <Shield className="w-5 h-5 text-emerald-400" />
                      Tenant Administration & Compliance
                    </h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Manage organizational vehicles, employee directory, permissions, and immutable audit ledger.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowInviteModal(true);
                        setGeneratedInvitation(null);
                        setInviteError(null);
                        setCopiedLink(false);
                      }}
                      className="text-xs bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Invite Employee
                    </button>
                    <button
                      onClick={() => {
                        fetchAdminVehicles();
                        fetchAdminUsers();
                        fetchAuditLogs();
                      }}
                      className="text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-1.5 rounded-lg transition"
                    >
                      Refresh Console
                    </button>
                  </div>
                </div>

                {/* Vehicle Action Error Banner */}
                {vehicleActionError && (
                  <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{vehicleActionError}</span>
                    </div>
                    <button onClick={() => setVehicleActionError(null)} className="text-rose-300 hover:text-white font-bold text-sm">
                      &times;
                    </button>
                  </div>
                )}

                {/* Two-Column Administration Layout */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Left Column: Organization Vehicles */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Car className="w-4 h-4 text-emerald-400" />
                          Fleet Vehicles ({adminVehicles.length})
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Registered employee vehicles across the organization
                        </p>
                      </div>
                      <button
                        onClick={fetchAdminVehicles}
                        className="text-[11px] text-slate-400 hover:text-white transition underline"
                      >
                        Reload
                      </button>
                    </div>

                    {adminVehiclesLoading ? (
                      <div className="p-8 text-center text-xs text-slate-400">Loading organization vehicles...</div>
                    ) : adminVehiclesError ? (
                      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
                        <span>{adminVehiclesError}</span>
                        <button onClick={fetchAdminVehicles} className="underline text-rose-300">Retry</button>
                      </div>
                    ) : adminVehicles.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400">No vehicles registered in organization.</div>
                    ) : (
                      <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                        {adminVehicles.map((v) => (
                          <div
                            key={v.id}
                            className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start justify-between gap-3 hover:border-slate-700 transition"
                          >
                            <div className="space-y-1.5 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-white text-xs">
                                  {v.year} {v.make} {v.model}
                                </span>
                                <span className="text-[10px] font-mono bg-slate-800 px-2 py-0.5 rounded text-slate-300 border border-slate-700">
                                  {v.license_plate}
                                </span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                                    v.status === 'ACTIVE'
                                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                      : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                                  }`}
                                >
                                  {v.status}
                                </span>
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-3">
                                <span>Color: <strong className="text-slate-200">{v.color}</strong></span>
                                <span>Seats: <strong className="text-slate-200">{v.total_seats}</strong></span>
                                <span>Type: <strong className="text-slate-200">{v.vehicle_type}</strong></span>
                              </div>
                              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 pt-0.5">
                                <Users className="w-3 h-3 text-slate-500" />
                                <span>
                                  Owner: <strong className="text-slate-300">{v.owner?.full_name || 'Unknown'}</strong>{' '}
                                  <span className="text-slate-500">({v.owner?.email || '—'})</span>
                                </span>
                              </div>
                            </div>
                            <div className="shrink-0 flex items-center">
                              {v.status === 'ACTIVE' ? (
                                <button
                                  onClick={() => handleDeactivateVehicle(v.id)}
                                  disabled={deactivatingVehicleId === v.id}
                                  className="text-[11px] px-2.5 py-1 rounded-lg border border-rose-800/50 bg-rose-950/30 text-rose-300 hover:bg-rose-900/50 hover:border-rose-700 transition font-medium disabled:opacity-50"
                                >
                                  {deactivatingVehicleId === v.id ? 'Deactivating...' : 'Deactivate'}
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-500 px-2 py-1 bg-slate-900 rounded border border-slate-800">
                                  Inactive
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Right Column: Organization Users & Permissions */}
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <Users className="w-4 h-4 text-cyan-400" />
                          Organization Directory ({adminUsers.length})
                        </h3>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Employees, account statuses, and system capabilities
                        </p>
                      </div>
                      <button
                        onClick={() => fetchAdminUsers()}
                        className="text-[11px] text-slate-400 hover:text-white transition underline"
                      >
                        Reload
                      </button>
                    </div>

                    {/* Filter and Search Bar */}
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="Search by name or email..."
                          value={adminUserSearch}
                          onChange={(e) => {
                            setAdminUserSearch(e.target.value);
                            fetchAdminUsers(adminUserFilter, e.target.value);
                          }}
                          className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                      </div>
                      <select
                        value={adminUserFilter}
                        onChange={(e) => {
                          setAdminUserFilter(e.target.value);
                          fetchAdminUsers(e.target.value, adminUserSearch);
                        }}
                        className="bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-emerald-500"
                      >
                        <option value="ALL">All Statuses</option>
                        <option value="ACTIVE">ACTIVE</option>
                        <option value="PENDING_VERIFICATION">PENDING</option>
                        <option value="SUSPENDED">SUSPENDED</option>
                        <option value="OFFBOARDED">OFFBOARDED</option>
                      </select>
                    </div>

                    {adminUsersLoading ? (
                      <div className="p-8 text-center text-xs text-slate-400">Loading directory...</div>
                    ) : adminUsersError ? (
                      <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center justify-between">
                        <span>{adminUsersError}</span>
                        <button onClick={() => fetchAdminUsers()} className="underline text-rose-300">Retry</button>
                      </div>
                    ) : adminUsers.length === 0 ? (
                      <div className="p-8 text-center text-xs text-slate-400">No employees found matching filter.</div>
                    ) : (
                      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                        {adminUsers.map((u) => (
                          <div
                            key={u.id}
                            className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex items-start justify-between gap-3 hover:border-slate-700 transition"
                          >
                            <div className="space-y-1 flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-bold text-white text-xs">{u.full_name}</span>
                                <span
                                  className={`text-[10px] px-2 py-0.5 rounded font-semibold uppercase ${
                                    u.status === 'ACTIVE'
                                      ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
                                      : u.status === 'PENDING_VERIFICATION'
                                      ? 'bg-amber-950/80 text-amber-300 border border-amber-800/60'
                                      : 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                                  }`}
                                >
                                  {u.status}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 truncate">{u.email}</div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-2">
                                <span>{u.work_department || 'General'}</span>
                                <span>&bull;</span>
                                <span>{u.work_location || 'Acme HQ'}</span>
                              </div>
                              <div className="flex items-center gap-1.5 pt-1">
                                {u.capabilities?.is_org_admin && (
                                  <span className="text-[10px] bg-purple-950/80 text-purple-300 border border-purple-800/60 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                    <Shield className="w-2.5 h-2.5" /> Admin
                                  </span>
                                )}
                                {u.capabilities?.can_drive && (
                                  <span className="text-[10px] bg-cyan-950/80 text-cyan-300 border border-cyan-800/60 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                    <Car className="w-2.5 h-2.5" /> Driver
                                  </span>
                                )}
                                {u.capabilities?.can_ride && (
                                  <span className="text-[10px] bg-slate-800 text-slate-300 border border-slate-700 px-1.5 py-0.5 rounded font-medium flex items-center gap-1">
                                    <Users className="w-2.5 h-2.5" /> Rider
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
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
            </>
            )}
          </div>
        )}

        {/* ================================================================= */}
        {/* INVITE EMPLOYEE MODAL (Admin Token Generation)                   */}
        {/* ================================================================= */}
        {isOrgAdmin && showInviteModal && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-emerald-400" />
                  Invite Corporate Employee
                </h3>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="text-slate-400 hover:text-white text-lg font-bold"
                >
                  &times;
                </button>
              </div>

              {!generatedInvitation ? (
                <form onSubmit={handleInviteEmployee} className="space-y-3">
                  <p className="text-xs text-slate-400">
                    Generate a single-use, cryptographically secure invitation token. The employee can use this token to set their password and activate their account.
                  </p>

                  {inviteError && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{inviteError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Corporate Email <span className="text-emerald-400">(@acme.com / @acme.corp)</span>
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="colleague@acme.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      placeholder="Jane Doe"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Work Department</label>
                      <input
                        type="text"
                        placeholder="Engineering"
                        value={inviteDepartment}
                        onChange={(e) => setInviteDepartment(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Work Location</label>
                      <input
                        type="text"
                        placeholder="Acme HQ"
                        value={inviteLocation}
                        onChange={(e) => setInviteLocation(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="inviteCanDrive"
                      checked={inviteCanDrive}
                      onChange={(e) => setInviteCanDrive(e.target.checked)}
                      className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500 h-4 w-4"
                    />
                    <label htmlFor="inviteCanDrive" className="text-xs text-slate-300">
                      Grant Driver Capability (allows publishing rides)
                    </label>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={inviteLoading}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 transition flex items-center gap-1.5 shadow-md shadow-emerald-500/20 disabled:opacity-50"
                    >
                      {inviteLoading ? 'Generating Token...' : 'Generate Token & Invite'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 shrink-0 text-emerald-400" />
                    <span>Employee created in <strong>PENDING_VERIFICATION</strong> status. Token generated!</span>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-400">One-Time Activation Token</label>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-xs text-emerald-400 break-all select-all">
                      {generatedInvitation.token}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-400">Full Activation Link (Send to Employee)</label>
                    <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 font-mono text-[11px] text-cyan-300 break-all select-all">
                      {generatedInvitation.activationUrl}
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400">
                    Valid for: <span className="text-white font-medium">7 days</span> (expires {new Date(generatedInvitation.expiresAt).toLocaleDateString()}). Single-use only.
                  </div>

                  <div className="flex items-center gap-2 pt-3 border-t border-slate-800">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(generatedInvitation.activationUrl);
                        setCopiedLink(true);
                        setTimeout(() => setCopiedLink(false), 3000);
                      }}
                      className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-slate-950 bg-emerald-500 hover:bg-emerald-400 transition flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                      {copiedLink ? 'Copied to Clipboard!' : 'Copy Activation Link'}
                    </button>
                    <a
                      href={generatedInvitation.activationUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="py-2 px-3 rounded-xl text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition flex items-center gap-1"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>
                      Open
                    </a>
                    <button
                      onClick={() => {
                        setGeneratedInvitation(null);
                        setInviteEmail('');
                        setInviteName('');
                      }}
                      className="py-2 px-3 rounded-xl text-xs text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 transition"
                    >
                      Invite Another
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
