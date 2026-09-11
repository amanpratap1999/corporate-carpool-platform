'use client';

import React, { useEffect, useRef, useState } from 'react';
import { MapPin, Building2, Search, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { getAuthHeaders } from '@/lib/auth-client';

export interface SelectedPlace {
  address: string;
  lat: number;
  lng: number;
  placeId?: string;
}

export interface PlacePrediction {
  place_id: string;
  description: string;
  main_text?: string;
  secondary_text?: string;
}

interface PlaceAutocompleteInputProps {
  label?: string;
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  onSelectPlace: (place: SelectedPlace) => void;
  onClearSelection?: () => void;
  className?: string;
  showPresets?: boolean;
  error?: string | null;
  selectedPlace?: SelectedPlace | null;
}

export const CORPORATE_PRESETS: SelectedPlace[] = [
  {
    address: '1600 Amphitheatre Pkwy, Mountain View, CA (Acme HQ)',
    lat: 37.422,
    lng: -122.0841,
    placeId: 'preset-acme-hq',
  },
  {
    address: '450 Dolores St, San Francisco, CA (SF Mission Dolores)',
    lat: 37.7615,
    lng: -122.426,
    placeId: 'preset-sf-mission',
  },
  {
    address: '300 S El Camino Real, San Mateo, CA (San Mateo Hub)',
    lat: 37.563,
    lng: -122.3255,
    placeId: 'preset-san-mateo',
  },
  {
    address: '340 University Ave, Palo Alto, CA (Palo Alto Station)',
    lat: 37.4445,
    lng: -122.1611,
    placeId: 'preset-palo-alto',
  },
  {
    address: '100 California Dr, Millbrae, CA (Millbrae BART)',
    lat: 37.5997,
    lng: -122.3867,
    placeId: 'preset-millbrae',
  },
];

export const PlaceAutocompleteInput: React.FC<PlaceAutocompleteInputProps> = ({
  label,
  placeholder = 'Search an address, landmark, business, or transit stop',
  value,
  onChange,
  onSelectPlace,
  onClearSelection,
  className = '',
  showPresets = true,
  error = null,
  selectedPlace = null,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const [predictions, setPredictions] = useState<PlacePrediction[]>([]);
  const [searchLoading, setSearchLoading] = useState<boolean>(false);
  const [resolvingDetails, setResolvingDetails] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const [showPresetsTab, setShowPresetsTab] = useState<boolean>(false);

  // Track the sequence of search requests to cancel/ignore stale responses
  const activeRequestIdRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Debounced places autocomplete search
  useEffect(() => {
    const query = value.trim();

    // Do not request the API for fewer than 2 characters
    if (query.length < 2) {
      setPredictions([]);
      setSearchLoading(false);
      setApiError(null);
      setHasSearched(false);
      return;
    }

    // If current value matches already selected place, do not re-query
    if (selectedPlace && selectedPlace.address === value) {
      return;
    }

    setSearchLoading(true);
    setApiError(null);

    // Cancel any previous in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const currentRequestId = ++activeRequestIdRef.current;

    const timeoutId = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/routing/places?input=${encodeURIComponent(query)}`, {
          headers: { ...getAuthHeaders() },
          signal: abortController.signal,
        });

        // Ignore stale response if user continued typing
        if (currentRequestId !== activeRequestIdRef.current) return;

        const data = await res.json();

        if (res.ok) {
          setPredictions(data.predictions || []);
          setHasSearched(true);
          setApiError(null);
        } else {
          setPredictions([]);
          if (res.status === 503) {
            setApiError('Google Maps API key is not configured on the server.');
          } else {
            setApiError(data.detail || data.title || 'Location search error.');
          }
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        if (currentRequestId === activeRequestIdRef.current) {
          setApiError('Failed to contact search service.');
          setPredictions([]);
        }
      } finally {
        if (currentRequestId === activeRequestIdRef.current) {
          setSearchLoading(false);
        }
      }
    }, 300); // 300ms debounce

    return () => {
      clearTimeout(timeoutId);
    };
  }, [value, selectedPlace]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    onChange(newVal);
    // If the user types or modifies text, invalidate previously selected coordinates
    if (selectedPlace && selectedPlace.address !== newVal) {
      onClearSelection?.();
    }
    setShowDropdown(true);
  };

  const handleSelectPrediction = async (prediction: PlacePrediction) => {
    setResolvingDetails(true);
    setApiError(null);

    try {
      const res = await fetch(
        `/api/v1/routing/place-details?place_id=${encodeURIComponent(prediction.place_id)}`,
        {
          headers: { ...getAuthHeaders() },
        }
      );

      const data = await res.json();

      if (res.ok && data.place && typeof data.place.lat === 'number' && typeof data.place.lng === 'number') {
        const placeObj: SelectedPlace = {
          address: data.place.address || prediction.description,
          lat: data.place.lat,
          lng: data.place.lng,
          placeId: data.place.place_id,
        };
        onChange(placeObj.address);
        onSelectPlace(placeObj);
        setShowDropdown(false);
        setPredictions([]);
        setHasSearched(false);
      } else {
        setApiError(data.detail || data.title || 'Could not resolve coordinates for this place.');
      }
    } catch {
      setApiError('Network error while resolving place coordinates.');
    } finally {
      setResolvingDetails(false);
    }
  };

  const handleSelectPreset = (preset: SelectedPlace) => {
    onChange(preset.address);
    onSelectPlace(preset);
    setShowDropdown(false);
    setPredictions([]);
    setHasSearched(false);
    setShowPresetsTab(false);
  };

  const hasConfirmedCoordinates =
    selectedPlace &&
    selectedPlace.address === value &&
    typeof selectedPlace.lat === 'number' &&
    typeof selectedPlace.lng === 'number';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
          <span>{label}</span>
          {hasConfirmedCoordinates ? (
            <span className="text-[10px] text-emerald-400 font-normal flex items-center gap-1">
              <CheckCircle className="w-3 h-3" /> Coordinates Verified
            </span>
          ) : value.trim().length > 0 ? (
            <span className="text-[10px] text-amber-400 font-normal">
              Select from dropdown
            </span>
          ) : null}
        </label>
      )}

      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
          <MapPin className={`w-4 h-4 ${hasConfirmedCoordinates ? 'text-emerald-400' : 'text-slate-400'}`} />
        </div>

        <input
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={() => setShowDropdown(true)}
          placeholder={placeholder}
          className={`w-full pl-9 pr-14 py-2 bg-slate-800/90 border rounded-lg text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 transition ${
            error
              ? 'border-rose-500/80 focus:border-rose-500 focus:ring-rose-500'
              : hasConfirmedCoordinates
              ? 'border-emerald-500/50 focus:border-emerald-500 focus:ring-emerald-500'
              : 'border-slate-700 focus:border-emerald-500 focus:ring-emerald-500'
          }`}
        />

        <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1">
          {searchLoading || resolvingDetails ? (
            <svg
              className="animate-spin h-3.5 w-3.5 text-emerald-400 mr-1"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : null}

          {showPresets && (
            <button
              type="button"
              onClick={() => {
                setShowPresetsTab(!showPresetsTab);
                setShowDropdown(true);
              }}
              className={`p-1 rounded text-slate-400 hover:text-slate-200 transition ${
                showPresetsTab ? 'bg-slate-700 text-emerald-300' : ''
              }`}
              title="Corporate Presets"
            >
              <Building2 className="w-3.5 h-3.5" />
            </button>
          )}

          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                onClearSelection?.();
                setPredictions([]);
                setShowDropdown(false);
              }}
              className="p-1 text-slate-500 hover:text-slate-300"
              title="Clear input"
            >
              <XCircle className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="text-[11px] text-rose-400 mt-1 flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Autocomplete & Preset Dropdown */}
      {showDropdown && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto divide-y divide-slate-800">
          {/* Resolving State */}
          {resolvingDetails && (
            <div className="p-3 text-xs text-center text-cyan-400 flex items-center justify-center gap-2">
              <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span>Resolving verified coordinates from Google Places...</span>
            </div>
          )}

          {/* API Error State */}
          {apiError && (
            <div className="p-3 text-xs bg-rose-950/40 text-rose-300 flex items-center gap-2 border-b border-rose-900/40">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span className="flex-1">{apiError}</span>
            </div>
          )}

          {/* Search Predictions Section */}
          {!showPresetsTab && (
            <div>
              {searchLoading && predictions.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                  <Search className="w-3.5 h-3.5 text-slate-500 animate-pulse" />
                  <span>Searching Google Places...</span>
                </div>
              )}

              {!searchLoading && hasSearched && predictions.length === 0 && !apiError && (
                <div className="p-4 text-center text-xs text-slate-400">
                  No places found for &quot;{value}&quot;. Try a different address or business name.
                </div>
              )}

              {predictions.length > 0 && (
                <div className="divide-y divide-slate-800/60">
                  <div className="px-3 py-1.5 bg-slate-800/40 text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Google Places Predictions</span>
                    <span className="text-emerald-400 font-normal lowercase text-[10px]">live results</span>
                  </div>
                  {predictions.map((p) => (
                    <div
                      key={p.place_id}
                      onClick={() => handleSelectPrediction(p)}
                      className="px-3 py-2.5 hover:bg-slate-800/80 cursor-pointer transition flex items-start gap-2.5 text-left"
                    >
                      <MapPin className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold text-slate-100 truncate">
                          {p.main_text || p.description}
                        </div>
                        {p.secondary_text && (
                          <div className="text-[11px] text-slate-400 truncate mt-0.5">
                            {p.secondary_text}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Corporate Presets Section */}
          {showPresets && (
            <div>
              <div
                onClick={() => setShowPresetsTab(!showPresetsTab)}
                className="px-3 py-1.5 bg-slate-800/80 hover:bg-slate-800 cursor-pointer flex items-center justify-between text-[10px] uppercase font-bold tracking-wider text-slate-300"
              >
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-3 h-3 text-emerald-400" />
                  <span>Corporate Campuses &amp; Hubs (Presets)</span>
                </div>
                <span className="text-[10px] text-slate-400 normal-case font-normal">
                  {showPresetsTab ? 'Hide' : 'View presets'}
                </span>
              </div>

              {showPresetsTab && (
                <div className="divide-y divide-slate-800/60 bg-slate-950/40">
                  {CORPORATE_PRESETS.map((preset) => (
                    <div
                      key={preset.placeId || preset.address}
                      onClick={() => handleSelectPreset(preset)}
                      className="px-3 py-2 hover:bg-slate-800/80 cursor-pointer transition flex items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-2">
                        <Building2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        <span className="text-xs text-slate-200 truncate">{preset.address}</span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 shrink-0 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-800/40">
                        HQ Preset
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
