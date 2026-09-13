import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';
import { rateLimiter } from '@/infrastructure/security/rate-limiter';

export interface ParsedRideRequest {
  origin?: string;
  destination?: string;
  date?: string; // YYYY-MM-DD
  time_window_start?: string; // HH:mm
  time_window_end?: string; // HH:mm
  target_time?: string; // HH:mm
  seats_needed: number;
  preferences: {
    quiet_ride?: boolean;
    avoid_highways?: boolean;
    avoid_tolls?: boolean;
    notes?: string;
  };
  confidence: number;
}

/**
 * Deterministic rule-based extractor for common commuter phrasing.
 * Provides instant parsing with 0 external API cost and guaranteed offline/local support.
 */
function extractHeuristically(text: string, timeZone?: string): ParsedRideRequest {
  const lower = text.toLowerCase();
  const result: ParsedRideRequest = {
    seats_needed: 1,
    preferences: {},
    confidence: 0.85,
  };

  // 1. Origin and Destination extraction: "from X to Y"
  const fromToMatch = text.match(/(?:from|pickup(?:\s+at)?)\s+([^,.\n]+?)\s+(?:to|drop(?:\s+at)?|destination)\s+([^,.\n]+?)(?:\s+(?:on|at|around|by|for|with|leaving)|$)/i);
  if (fromToMatch) {
    result.origin = fromToMatch[1].trim();
    result.destination = fromToMatch[2].trim();
  }

  // 2. Date extraction ("tomorrow", "today", or "YYYY-MM-DD")
  const today = new Date();
  if (lower.includes('tomorrow')) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    result.date = d.toISOString().split('T')[0];
  } else if (lower.includes('today')) {
    result.date = today.toISOString().split('T')[0];
  } else {
    const isoDateMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
    if (isoDateMatch) {
      result.date = isoDateMatch[0];
    }
  }

  // 3. Time extraction ("around 9 AM", "at 8:30", "between 8 and 9")
  const timeMatch = text.match(/\b(?:at|around|by)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i);
  if (timeMatch) {
    let hours = parseInt(timeMatch[1], 10);
    const minutes = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const ampm = timeMatch[3]?.toLowerCase();

    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;

    const formattedTime = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    result.target_time = formattedTime;

    // Default 30-min window around target time
    const startHour = Math.max(0, hours - (minutes < 15 ? 1 : 0));
    const startMin = minutes < 15 ? (minutes + 60 - 15) % 60 : minutes - 15;
    const endHour = Math.min(23, hours + (minutes > 45 ? 1 : 0));
    const endMin = (minutes + 15) % 60;

    result.time_window_start = `${String(startHour).padStart(2, '0')}:${String(startMin).padStart(2, '0')}`;
    result.time_window_end = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
  }

  // 4. Seats extraction ("2 seats", "for 3 people", "1 passenger")
  const seatsMatch = text.match(/\b(\d+)\s*(?:seats?|passengers?|people|riders?)\b/i);
  if (seatsMatch) {
    result.seats_needed = Math.max(1, parseInt(seatsMatch[1], 10));
  }

  // 5. Preferences
  if (lower.includes('quiet') || lower.includes('silent')) {
    result.preferences.quiet_ride = true;
  }
  if (lower.includes('no toll') || lower.includes('avoid tolls')) {
    result.preferences.avoid_tolls = true;
  }
  if (lower.includes('no highway') || lower.includes('avoid highways')) {
    result.preferences.avoid_highways = true;
  }

  return result;
}

/**
 * Optional provider adapter that utilizes an external LLM when configured,
 * with strict timeout and seamless deterministic fallback.
 */
async function parseWithProviderAdapter(text: string, timeZone?: string): Promise<ParsedRideRequest> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return extractHeuristically(text, timeZone);
  }

  try {
    if (process.env.OPENAI_API_KEY) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 2500);
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content:
                'Extract commuting ride request details as JSON: { origin, destination, date (YYYY-MM-DD), target_time (HH:mm), time_window_start (HH:mm), time_window_end (HH:mm), seats_needed (number), preferences: { quiet_ride, avoid_highways, avoid_tolls, notes } }',
            },
            { role: 'user', content: text },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 200,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content);
          return {
            origin: parsed.origin,
            destination: parsed.destination,
            date: parsed.date,
            time_window_start: parsed.time_window_start,
            time_window_end: parsed.time_window_end,
            target_time: parsed.target_time,
            seats_needed: Math.max(1, Number(parsed.seats_needed) || 1),
            preferences: parsed.preferences || {},
            confidence: 0.95,
          };
        }
      }
    }
  } catch {
    // Fallback to deterministic extraction
  }

  return extractHeuristically(text, timeZone);
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) return auth.response;

  const rateLimit = await rateLimiter.checkShared(`ai:parse:${auth.ctx.user.id}`, 20, 60);
  if (!rateLimit.allowed) {
    return problemResponse(
      429,
      'Too Many Requests',
      `Rate limit exceeded for AI parsing. Retry in ${rateLimit.resetSeconds}s`,
      'ERR_RATE_LIMIT_EXCEEDED',
      req.nextUrl.pathname,
      { 'Retry-After': String(rateLimit.resetSeconds) }
    );
  }

  let body: { text?: string; time_zone?: string };
  try {
    body = await req.json();
  } catch {
    return problemResponse(400, 'Bad Request', 'Invalid JSON body', 'ERR_INVALID_BODY', req.nextUrl.pathname);
  }

  const { text, time_zone } = body;
  if (!text || typeof text !== 'string' || text.trim().length < 5) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'text must be a string containing at least 5 characters',
      'ERR_INVALID_TEXT',
      req.nextUrl.pathname
    );
  }

  if (text.length > 500) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'text exceeds maximum allowed length of 500 characters',
      'ERR_TEXT_TOO_LONG',
      req.nextUrl.pathname
    );
  }

  // Parse via provider adapter or deterministic rule extractor
  const parsed = await parseWithProviderAdapter(text.trim(), time_zone);
  return NextResponse.json({ parsed });
}
