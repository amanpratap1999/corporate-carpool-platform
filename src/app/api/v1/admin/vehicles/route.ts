import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, problemResponse } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;
  const store = getRepository();

  try {
    const allVehicles = await store.getAllVehicles();
    // Enforce tenant isolation strictly
    const orgVehicles = allVehicles.filter((v) => v.organization_id === ctx.org.id);
    const allUsers = await store.getAllUsers();

    const enrichedVehicles = orgVehicles.map((v) => {
      const owner = allUsers.find((u) => u.id === v.owner_id);
      return {
        id: v.id,
        owner_id: v.owner_id,
        owner_name: owner ? owner.full_name : 'Unknown',
        owner_email: owner ? owner.email : 'Unknown',
        make: v.make,
        model: v.model,
        year: v.year,
        color: v.color,
        license_plate: v.license_plate,
        total_seats: v.total_seats,
        vehicle_type: v.vehicle_type || 'CAR',
        max_passenger_capacity: v.max_passenger_capacity ?? Math.max(1, v.total_seats - 1),
        status: v.status,
        created_at: v.created_at,
        updated_at: v.updated_at,
      };
    });

    return NextResponse.json({
      vehicles: enrichedVehicles,
      total: enrichedVehicles.length,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to retrieve vehicles';
    return problemResponse(500, 'Internal Server Error', errorMsg, 'ERR_INTERNAL_ERROR', req.nextUrl.pathname);
  }
}
