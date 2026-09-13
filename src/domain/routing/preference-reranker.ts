/**
 * Preference-Aware Re-ranking Engine
 * Blends passenger commuter preferences into the canonical geometric/time match score.
 */

export interface PassengerPreferences {
  quiet_ride?: boolean;
  department_match?: boolean;
  preferred_work_location?: string;
  max_detour_minutes?: number;
  tags?: string[];
}

export interface CandidateRide {
  ride_id: string;
  driver?: {
    id: string;
    full_name: string;
    work_department?: string;
    work_location?: string;
    avatar_url?: string;
  };
  vehicle?: {
    make?: string;
    model?: string;
    total_seats?: number;
  };
  match_score: number;
  nearestPickupDistanceMeters: number;
  nearestDropDistanceMeters: number;
  delta_departure_minutes?: number;
  available_seats: number;
}

export interface RerankedCandidate extends CandidateRide {
  preference_score: number; // 0 to 100
  preference_reasons: string[];
  final_score: number; // Blended composite (lower is better)
}

/**
 * Re-ranks candidate rides using passenger preferences.
 * Formula:
 * final_score = match_score - (preference_score * 0.8)
 */
export function rerankCandidatesWithPreferences(
  candidates: CandidateRide[],
  preferences: PassengerPreferences,
  passengerDepartment?: string
): RerankedCandidate[] {
  return candidates
    .map((candidate) => {
      let affinityScore = 50; // Neutral baseline
      const reasons: string[] = [];

      // 1. Department match bonus (coworker camaraderie / safety)
      if (
        preferences.department_match &&
        passengerDepartment &&
        candidate.driver?.work_department &&
        passengerDepartment.toLowerCase() === candidate.driver.work_department.toLowerCase()
      ) {
        affinityScore += 25;
        reasons.push(`Same department colleague (${candidate.driver.work_department})`);
      }

      // 2. Work location alignment
      if (
        preferences.preferred_work_location &&
        candidate.driver?.work_location &&
        candidate.driver.work_location.toLowerCase().includes(preferences.preferred_work_location.toLowerCase())
      ) {
        affinityScore += 15;
        reasons.push(`Direct office route (${candidate.driver.work_location})`);
      }

      // 3. Quiet ride preference
      if (preferences.quiet_ride) {
        // Rides with fewer passenger stops or spacious vehicle offer quieter rides
        if (candidate.available_seats >= 2) {
          affinityScore += 10;
          reasons.push('Roomy vehicle suitable for quiet commute');
        }
      }

      // 4. Detour penalty if exceeding preferred detour
      if (preferences.max_detour_minutes) {
        const estimatedDetourMinutes = (candidate.nearestPickupDistanceMeters + candidate.nearestDropDistanceMeters) / 400;
        if (estimatedDetourMinutes > preferences.max_detour_minutes) {
          affinityScore -= 20;
          reasons.push(`Detour (${Math.round(estimatedDetourMinutes)} min) exceeds preferred limit`);
        }
      }

      const clampedAffinity = Math.max(0, Math.min(100, affinityScore));
      // Blended score: lower match_score is better, higher affinity lowers the composite score further
      const finalScore = Math.round((candidate.match_score - (clampedAffinity - 50) * 0.8) * 10) / 10;

      return {
        ...candidate,
        preference_score: clampedAffinity,
        preference_reasons: reasons,
        final_score: finalScore,
      };
    })
    .sort((a, b) => a.final_score - b.final_score);
}
