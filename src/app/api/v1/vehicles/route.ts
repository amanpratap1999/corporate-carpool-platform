import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, problemResponse } from '@/services/api-context';
import { getRepository } from '@/services/repository-factory';
import { Vehicle, VehicleType } from '@/domain/types';

export async function GET(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;
  const store = getRepository();

  const vehicles = (await store.getAllVehicles()).filter(
    (v) => v.owner_id === ctx.user.id && v.organization_id === ctx.org.id
  );

  return NextResponse.json({ vehicles });
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (!auth.success) {
    return auth.response;
  }
  const ctx = auth.ctx;
  const store = getRepository();

  try {
    const body = await req.json();
    const { make, model, year, color, license_plate, total_seats, vehicle_type } = body;

    if (!make || !model || !year || !color || !license_plate || total_seats === undefined) {
      return problemResponse(
        400,
        'Invalid Vehicle Payload',
        'make, model, year, color, license_plate, and total_seats are required.',
        'VALIDATION_ERROR',
        '/api/v1/vehicles'
      );
    }

    const type: VehicleType = ['CAR', 'MOTORCYCLE', 'VAN'].includes(vehicle_type)
      ? (vehicle_type as VehicleType)
      : 'CAR';

    const seats = Number(total_seats);
    // Multimodal bounds: Motorcycles have total 1-2 seats (1 passenger), Cars 2-8, Vans up to 15
    const minSeats = type === 'MOTORCYCLE' ? 1 : 2;
    if (seats < minSeats || seats > 15) {
      return problemResponse(
        400,
        'Invalid Seat Count',
        `Total seats must be between ${minSeats} and 15 for vehicle type ${type}.`,
        'VALIDATION_ERROR',
        '/api/v1/vehicles'
      );
    }

    // Check unique plate within org
    const existing = (await store.getAllVehicles()).find(
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

    const maxPassengerCapacity = type === 'MOTORCYCLE' ? 1 : Math.max(1, seats - 1);

    const vehicle: Vehicle = {
      id: crypto.randomUUID(),
      owner_id: ctx.user.id,
      organization_id: ctx.org.id,
      make: make.trim(),
      model: model.trim(),
      year: Number(year),
      color: color.trim(),
      license_plate: license_plate.trim().toUpperCase(),
      total_seats: seats,
      vehicle_type: type,
      max_passenger_capacity: maxPassengerCapacity,
      status: 'ACTIVE',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await store.setVehicle(vehicle);

    // Auto-grant driver capability
    const caps = await store.getUserCapability(ctx.user.id);
    if (caps && !caps.can_drive) {
      caps.can_drive = true;
      caps.driver_verified_at = new Date().toISOString();
      await store.setUserCapability(caps);
    }

    store.logAudit(ctx.org.id, ctx.user.id, 'VEHICLE', vehicle.id, 'CREATE', undefined, 'ACTIVE', {
      license_plate: vehicle.license_plate,
      vehicle_type: type,
    });

    return NextResponse.json(vehicle, { status: 201 });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error';
    return problemResponse(500, 'Server Error', errorMsg, 'INTERNAL_ERROR', '/api/v1/vehicles');
  }
}
