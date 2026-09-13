import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';
import { rateLimiter } from '@/infrastructure/security/rate-limiter';
import {
  rerankCandidatesWithPreferences,
  type CandidateRide,
  type PassengerPreferences,
} from '@/domain/routing/preference-reranker';

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) return auth.response;

  const rateLimit = await rateLimiter.checkShared(`ai:rerank:${auth.ctx.user.id}`, 30, 60);
  if (!rateLimit.allowed) {
    return problemResponse(
      429,
      'Too Many Requests',
      `Rate limit exceeded for preference re-ranking. Retry in ${rateLimit.resetSeconds}s`,
      'ERR_RATE_LIMIT_EXCEEDED',
      req.nextUrl.pathname,
      { 'Retry-After': String(rateLimit.resetSeconds) }
    );
  }

  let body: {
    candidates?: CandidateRide[];
    preferences?: PassengerPreferences;
  };
  try {
    body = await req.json();
  } catch {
    return problemResponse(400, 'Bad Request', 'Invalid JSON body', 'ERR_INVALID_BODY', req.nextUrl.pathname);
  }

  const { candidates, preferences = {} } = body;
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'candidates must be a non-empty array of candidate rides',
      'ERR_INVALID_CANDIDATES',
      req.nextUrl.pathname
    );
  }

  // Safety filter: ensure candidate rides cannot bypass seat or score validations
  const validCandidates = candidates.filter(
    (c) => Number(c.available_seats) > 0 && typeof c.match_score === 'number' && !isNaN(c.match_score)
  );
  if (validCandidates.length === 0) {
    return problemResponse(
      422,
      'Unprocessable Entity',
      'No valid candidate rides with available seats provided',
      'ERR_NO_VALID_CANDIDATES',
      req.nextUrl.pathname
    );
  }

  const enableReranking = process.env.ENABLE_VECTOR_RERANKING !== 'false';
  if (!enableReranking) {
    const unchanged = validCandidates.map((c) => ({
      ...c,
      preference_score: 50,
      preference_reasons: ['Preference re-ranking is disabled by system configuration'],
      final_score: c.match_score,
    }));
    return NextResponse.json({ reranked: unchanged });
  }

  const reranked = rerankCandidatesWithPreferences(
    validCandidates,
    preferences,
    auth.ctx.user.work_department
  );

  return NextResponse.json({ reranked });
}
