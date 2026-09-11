import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';

/**
 * GET /api/v1/routing/places?input=<query>
 *
 * Server-side proxy for Google Places Autocomplete.
 * Prevents exposing the API key to the client while enforcing authentication.
 */
export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) return auth.response;

  const input = req.nextUrl.searchParams.get('input');
  if (!input || input.trim().length < 2) {
    return problemResponse(
      422, 'Unprocessable Entity',
      'input query parameter is required (minimum 2 characters)',
      'ERR_MISSING_INPUT',
      req.nextUrl.pathname
    );
  }

  if (input.trim().length > 200) {
    return problemResponse(
      422, 'Unprocessable Entity',
      'input query parameter cannot exceed 200 characters',
      'ERR_INPUT_TOO_LONG',
      req.nextUrl.pathname
    );
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return problemResponse(
      503, 'Service Unavailable',
      'Google Maps API key is not configured. Set GOOGLE_MAPS_API_KEY in environment variables.',
      'ERR_GOOGLE_MAPS_NOT_CONFIGURED',
      req.nextUrl.pathname
    );
  }

  try {
    // 1. Try modern Google Places API (New)
    const newPlacesRes = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify({ input: input.trim() }),
    });

    if (newPlacesRes.ok) {
      const data = await newPlacesRes.json();
      const predictions = (data.suggestions || []).map((s: any) => ({
        place_id: s.placePrediction?.placeId,
        description: s.placePrediction?.text?.text,
        main_text: s.placePrediction?.structuredFormat?.mainText?.text,
        secondary_text: s.placePrediction?.structuredFormat?.secondaryText?.text,
      }));
      return NextResponse.json({ predictions });
    }

    // 2. Fallback to legacy Google Places API
    const url = new URL('https://maps.googleapis.com/maps/api/place/autocomplete/json');
    url.searchParams.set('input', input.trim());
    url.searchParams.set('types', 'geocode|establishment');
    url.searchParams.set('key', apiKey);

    const res = await fetch(url.toString());
    if (!res.ok) {
      return problemResponse(
        502, 'Bad Gateway',
        `Google Places API HTTP error: ${res.status}`,
        'ERR_GOOGLE_MAPS_UPSTREAM_ERROR',
        req.nextUrl.pathname
      );
    }

    const data = await res.json();
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      return problemResponse(
        502, 'Bad Gateway',
        `Google Places API error: ${data.status}. ${data.error_message || ''}`,
        'ERR_GOOGLE_MAPS_UPSTREAM_ERROR',
        req.nextUrl.pathname
      );
    }

    const predictions = (data.predictions || []).map((p: any) => ({
      place_id: p.place_id,
      description: p.description,
      main_text: p.structured_formatting?.main_text,
      secondary_text: p.structured_formatting?.secondary_text,
    }));

    return NextResponse.json({ predictions });
  } catch (err) {
    console.error('Google Places Autocomplete failed:', err);
    return problemResponse(
      502, 'Bad Gateway',
      'Failed to contact Google Places API.',
      'ERR_GOOGLE_MAPS_UPSTREAM_ERROR',
      req.nextUrl.pathname
    );
  }
}
