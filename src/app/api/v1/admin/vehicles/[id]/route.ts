import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, problemResponse } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';
import { Vehicle } from '@/domain/types';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;
  const { id: vehicleId } = await params;
  const store = getRepository();

  try {
    const vehicle = await store.getVehicle(vehicleId);
    // Tenant isolation & existence check
    if (!vehicle || vehicle.organization_id !== ctx.org.id) {
      return problemResponse(
        404,
        'Vehicle Not Found',
        'The specified vehicle does not exist in your organization.',
        'NOT_FOUND',
        req.nextUrl.pathname
      );
    }

    // Referential integrity check: Active rides must not lose their vehicle reference
    const allRides = await store.getAllRides();
    const activeRides = allRides.filter(
      (r) => r.vehicle_id === vehicleId && (r.status === 'SCHEDULED' || r.status === 'IN_PROGRESS')
    );

    if (activeRides.length > 0) {
      return problemResponse(
        409,
        'Conflict: Vehicle In Use',
        `Cannot deactivate vehicle: currently assigned to ${activeRides.length} active scheduled or in-progress ride(s).`,
        'ERR_VEHICLE_IN_USE',
        req.nextUrl.pathname
      );
    }

    if (vehicle.status === 'INACTIVE') {
      return problemResponse(
        400,
        'Vehicle Already Inactive',
        'The specified vehicle is already inactive.',
        'ERR_VEHICLE_ALREADY_INACTIVE',
        req.nextUrl.pathname
      );
    }

    // Soft delete: transition status to INACTIVE
    const updatedVehicle: Vehicle = {
      ...vehicle,
      status: 'INACTIVE',
      updated_at: new Date().toISOString(),
    };
    await store.setVehicle(updatedVehicle);

    // Audit log
    await store.logAudit(
      ctx.org.id,
      ctx.user.id,
      'VEHICLE',
      vehicle.id,
      'STATE_TRANSITION',
      vehicle.status,
      'INACTIVE',
      { reason: 'Administrator deactivation', license_plate: vehicle.license_plate }
    );

    return NextResponse.json({
      message: 'Vehicle deactivated successfully',
      vehicle: updatedVehicle,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Failed to deactivate vehicle';
    return problemResponse(500, 'Internal Server Error', errorMsg, 'ERR_INTERNAL_ERROR', req.nextUrl.pathname);
  }
}
