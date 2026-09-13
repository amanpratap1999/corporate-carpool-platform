import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';
import { rateLimiter } from '@/infrastructure/security/rate-limiter';

export interface MatchExplanationRequest {
  match_score?: number;
  detour_meters: number;
  delta_departure_minutes: number;
  available_seats: number;
  driver_name?: string;
  origin_address?: string;
  destination_address?: string;
}

function generateMatchExplanation(data: MatchExplanationRequest): {
  explanation: string;
  highlights: string[];
  score_breakdown: {
    detour_impact: 'minimal' | 'moderate' | 'high';
    timing_impact: 'exact' | 'near' | 'flexible';
    seat_comfort: 'plentiful' | 'moderate' | 'limited';
  };
} {
  const detourKm = (data.detour_meters / 1000).toFixed(1);
  const approxExtraMins = Math.max(1, Math.round(data.detour_meters / 400)); // ~25 km/h urban speed

  const highlights: string[] = [];

  // Detour assessment
  let detourImpact: 'minimal' | 'moderate' | 'high';
  if (data.detour_meters <= 500) {
    detourImpact = 'minimal';
    highlights.push(`Direct route corridor (<500m detour, ~${approxExtraMins} min extra)`);
  } else if (data.detour_meters <= 1500) {
    detourImpact = 'moderate';
    highlights.push(`Minor detour (${detourKm} km, ~${approxExtraMins} mins extra)`);
  } else {
    detourImpact = 'high';
    highlights.push(`Moderate detour (${detourKm} km)`);
  }

  // Timing assessment
  let timingImpact: 'exact' | 'near' | 'flexible';
  if (data.delta_departure_minutes <= 5) {
    timingImpact = 'exact';
    highlights.push('Departs within 5 minutes of your target departure');
  } else if (data.delta_departure_minutes <= 20) {
    timingImpact = 'near';
    highlights.push(`Departs within ${data.delta_departure_minutes} minutes of schedule`);
  } else {
    timingImpact = 'flexible';
    highlights.push(`Departs ${data.delta_departure_minutes} minutes from target`);
  }

  // Seat assessment
  let seatComfort: 'plentiful' | 'moderate' | 'limited';
  if (data.available_seats >= 3) {
    seatComfort = 'plentiful';
    highlights.push(`Spacious vehicle with ${data.available_seats} seats available`);
  } else if (data.available_seats === 2) {
    seatComfort = 'moderate';
    highlights.push('2 open seats available');
  } else {
    seatComfort = 'limited';
    highlights.push('Last remaining seat');
  }

  // Compose conversational explanation
  const driverPart = data.driver_name ? `${data.driver_name}'s ride is ` : 'This ride is ';
  const detourDesc = data.detour_meters <= 500 ? 'directly on your route' : `only ~${approxExtraMins} min out of your way`;
  const timeDesc = data.delta_departure_minutes <= 10 ? 'departs almost exactly when you need' : `departs ~${data.delta_departure_minutes}m from your time`;
  const seatDesc = data.available_seats > 1 ? `${data.available_seats} seats open` : '1 seat remaining';

  const explanation = `${driverPart}${detourDesc}, ${timeDesc}, with ${seatDesc}.`;

  return {
    explanation,
    highlights,
    score_breakdown: {
      detour_impact: detourImpact,
      timing_impact: timingImpact,
      seat_comfort: seatComfort,
    },
  };
}

async function explainWithProviderAdapter(data: MatchExplanationRequest): Promise<{
  explanation: string;
  highlights: string[];
  score_breakdown: {
    detour_impact: 'minimal' | 'moderate' | 'high';
    timing_impact: 'exact' | 'near' | 'flexible';
    seat_comfort: 'plentiful' | 'moderate' | 'limited';
  };
}> {
  // Always compute the authoritative deterministic result
  const baseResult = generateMatchExplanation(data);

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return baseResult;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'Summarize why this commuter carpool matches the rider in one friendly sentence. Do not change facts or scores.',
          },
          {
            role: 'user',
            content: `Driver: ${data.driver_name || 'Host'}. Detour: ${data.detour_meters}m. Time delta: ${data.delta_departure_minutes}m. Open seats: ${data.available_seats}. Key points: ${baseResult.highlights.join(', ')}`,
          },
        ],
        max_tokens: 60,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.ok) {
      const respData = await res.json();
      const aiText = respData.choices?.[0]?.message?.content?.trim();
      if (aiText && aiText.length > 10) {
        // Authoritative score breakdown and highlights are preserved strictly
        return {
          ...baseResult,
          explanation: aiText,
        };
      }
    }
  } catch {
    // Fallback to deterministic explanation
  }

  return baseResult;
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) return auth.response;

  const rateLimit = await rateLimiter.checkShared(`ai:explain:${auth.ctx.user.id}`, 60, 60);
  if (!rateLimit.allowed) {
    return problemResponse(
      429,
      'Too Many Requests',
      `Rate limit exceeded for match explainer. Retry in ${rateLimit.resetSeconds}s`,
      'ERR_RATE_LIMIT_EXCEEDED',
      req.nextUrl.pathname,
      { 'Retry-After': String(rateLimit.resetSeconds) }
    );
  }

  let body: MatchExplanationRequest;
  try {
    body = await req.json();
  } catch {
    return problemResponse(400, 'Bad Request', 'Invalid JSON body', 'ERR_INVALID_BODY', req.nextUrl.pathname);
  }

  if (body.detour_meters === undefined || body.delta_departure_minutes === undefined || body.available_seats === undefined) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'detour_meters, delta_departure_minutes, and available_seats are required numbers',
      'ERR_MISSING_PARAMETERS',
      req.nextUrl.pathname
    );
  }

  const result = await explainWithProviderAdapter(body);
  return NextResponse.json(result);
}
