import { NextRequest, NextResponse } from 'next/server';
import { getRequestContext, problemResponse } from '@/services/api-context';
import { initializeSeedData } from '@/services/seed-data';
import { Vehicle } from '@/domain/types';

export async function GET(req: NextRequest) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);

  const vehicles = Array.from(store.vehicles.values()).filter(
    (v) => v.owner_id === ctx.user.id && v.organization_id === ctx.org.id
  );

  return NextResponse.json({ vehicles });
}

export async function POST(req: NextRequest) {
  const store = initializeSeedData();
  const ctx = getRequestContext(req);

  try {
    const body = await req.json();
    const { make, model, year, color, license_plate, total_seats } = body;

    if (!make || !model || !year || !color || !license_plate || !total_seats) {
      return problemResponse(
        400,
        'Invalid Vehicle Payload',
        'make, model, year, color, license_plate, and total_seats are required.',
        'VALIDATION_ERROR',
        '/api/v1/vehicles'
      );
    }

    if (total_seats < 2 || total_seats > 15) {
      return problemResponse(
        400,
        'Invalid Seat Count',
        'Total seats must be between 2 and 15.',
        'VALIDATION_ERROR',
        '/api/v1/vehicles'
      );
    }

    // Check unique plate within org
    const existing = Array.from(store.vehicles.values()).find(
      (v) => v.organization_id === ctx.org.id && v.license_plate.toUpperCase() === license_plate.trim().toUpperCase()
    );
    if (existing) {
      return problemResponse(
        409,
        'Duplicate Vehicle License Plate',
        `A vehicle with license plate '${license_plate}' is already registered in this organization.`,
        'DUPLICATE_PLATE',
        '/api/v1/vehicles'
      );
    }

    const vehicle: Vehicle = {
      id: crypto.randomUUID(),
      owner_id: ctx.user.id,
      organization_id: ctx.org.id,
      make: make.trim(),
      model: model.trim(),
      year: Number(year),
      color: color.trim(),
      license_plate: license_plate.trim().toUpperCase(),
      total_seats: Number(total_seats),
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    store.vehicles.set(vehicle.id, vehicle);

    // Auto-grant or verify driver capability
    const caps = store.userCapabilities.get(ctx.user.id);
    if (caps && !caps.can_drive) {
      caps.can_drive = true;
      caps.driver_verified_at = new Date().toISOString();
      store.userCapabilities.set(ctx.user.id, caps);
    }

    store.logAudit(ctx.org.id, ctx.user.id, 'VEHICLE', vehicle.id, 'CREATE', undefined, 'ACTIVE', {
      license_plate: vehicle.license_plate,
    });

    return NextResponse.json(vehicle, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(500, 'Server Error', errorMsg, 'INTERNAL_ERROR', '/api/v1/vehicles');
  }
}
