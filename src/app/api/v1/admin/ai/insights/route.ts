import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, problemResponse } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';
import { rateLimiter } from '@/infrastructure/security/rate-limiter';

export interface AdminInsightReport {
  generated_at: string;
  organization: {
    id: string;
    name: string;
  };
  metrics: {
    total_rides: number;
    scheduled_rides: number;
    completed_rides: number;
    cancelled_rides: number;
    cancellation_rate_percent: number;
    total_seats_offered: number;
    seats_booked: number;
    seat_utilization_rate_percent: number;
    total_booking_requests: number;
    accepted_requests: number;
    booking_acceptance_rate_percent: number;
  };
  key_findings: string[];
  recommendations: string[];
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.success) return auth.response;

  const ctx = auth.ctx;
  const rateLimit = await rateLimiter.checkShared(`admin:insights:${ctx.user.id}`, 10, 60);
  if (!rateLimit.allowed) {
    return problemResponse(
      429,
      'Too Many Requests',
      `Rate limit exceeded for admin insights. Retry in ${rateLimit.resetSeconds}s`,
      'ERR_RATE_LIMIT_EXCEEDED',
      req.nextUrl.pathname,
      { 'Retry-After': String(rateLimit.resetSeconds) }
    );
  }

  const store = getRepository();
  const metrics = await store.getOrganizationRideMetrics(ctx.org.id);

  const totalRides = metrics.totalRides;
  const scheduledRides = metrics.scheduledRides;
  const completedRides = metrics.completedRides;
  const cancelledRides = metrics.cancelledRides;
  const cancellationRate = totalRides > 0 ? Math.round((cancelledRides / totalRides) * 1000) / 10 : 0;

  const totalSeatsOffered = metrics.totalSeatsOffered;
  const availableSeats = metrics.availableSeats;
  const seatsBooked = Math.max(0, totalSeatsOffered - availableSeats);
  const seatUtilization =
    totalSeatsOffered > 0 ? Math.round((seatsBooked / totalSeatsOffered) * 1000) / 10 : 0;

  const totalRequests = metrics.totalRequests;
  const acceptedRequests = metrics.acceptedRequests;
  const acceptanceRate =
    totalRequests > 0 ? Math.round((acceptedRequests / totalRequests) * 1000) / 10 : 0;

  // Synthesize executive findings
  const keyFindings: string[] = [];
  const recommendations: string[] = [];

  if (seatUtilization > 75) {
    keyFindings.push(`High carpool demand: ${seatUtilization}% of offered seats are currently booked.`);
    recommendations.push('Consider offering commuter parking incentives for drivers hosting 3+ seat rides.');
  } else if (seatUtilization < 30) {
    keyFindings.push(`Available vehicle capacity is underutilized (${seatUtilization}% occupancy).`);
    recommendations.push('Promote the carpooling program during company all-hands or departmental onboarding.');
  } else {
    keyFindings.push(`Balanced fleet utilization at ${seatUtilization}% average occupancy.`);
  }

  if (cancellationRate > 15) {
    keyFindings.push(`Elevated trip cancellation rate of ${cancellationRate}%.`);
    recommendations.push('Review automatic expiration grace periods and send earlier departure reminder notifications.');
  } else {
    keyFindings.push(`Healthy ride reliability with a low cancellation rate of ${cancellationRate}%.`);
  }

  if (totalRequests > 0 && acceptanceRate < 50) {
    keyFindings.push(`Host approval bottleneck: Only ${acceptanceRate}% of seat requests are accepted by drivers.`);
    recommendations.push('Enable faster driver notifications via SMS or push alerts to prevent pending request expiration.');
  }

  if (recommendations.length === 0) {
    recommendations.push('Current carpool metrics are optimal. Continue monitoring weekly demand trends.');
  }

  const report: AdminInsightReport = {
    generated_at: new Date().toISOString(),
    organization: {
      id: ctx.org.id,
      name: ctx.org.name,
    },
    metrics: {
      total_rides: totalRides,
      scheduled_rides: scheduledRides,
      completed_rides: completedRides,
      cancelled_rides: cancelledRides,
      cancellation_rate_percent: cancellationRate,
      total_seats_offered: totalSeatsOffered,
      seats_booked: seatsBooked,
      seat_utilization_rate_percent: seatUtilization,
      total_booking_requests: totalRequests,
      accepted_requests: acceptedRequests,
      booking_acceptance_rate_percent: acceptanceRate,
    },
    key_findings: keyFindings,
    recommendations,
  };

  return NextResponse.json(report);
}
