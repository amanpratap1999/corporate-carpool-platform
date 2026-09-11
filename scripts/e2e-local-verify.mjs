#!/usr/bin/env node
/**
 * e2e-local-verify.mjs
 * End-to-end verification of local services running on http://localhost:3000
 */

const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@acme.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'ComplexAdminPass123!';
const CRON_SECRET = process.env.CRON_SECRET || 'f215d20e6e5de282deea2fd7be60a04b3b4f9128fcb612ea319836feb9b71297';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    failed++;
    throw new Error(message);
  }
  console.log(`  ✓ PASS: ${message}`);
  passed++;
}

async function run() {
  console.log(`\n=== Running Full Local E2E Verification on ${APP_URL} ===\n`);

  // 1. Health check
  const healthRes = await fetch(`${APP_URL}/api/v1/health`);
  assert(healthRes.ok, `Health endpoint returns 200 (got ${healthRes.status})`);
  const healthData = await healthRes.json();
  assert(healthData.status === 'ok', `Health status is 'ok'`);
  assert(healthData.checks?.database?.status === 'ok', `PostgreSQL check is 'ok'`);
  assert(healthData.checks?.google_maps?.status === 'ok', `Google Maps check is 'ok'`);

  // 2. Login
  const loginRes = await fetch(`${APP_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  assert(loginRes.ok, `Admin login returns 200 (got ${loginRes.status})`);
  const loginData = await loginRes.json();
  assert(!!loginData.token, `JWT token received`);
  const token = loginData.token;
  const authHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  // 3. User profile /me
  const meRes = await fetch(`${APP_URL}/api/v1/me`, { headers: authHeaders });
  assert(meRes.ok, `GET /api/v1/me returns 200 (got ${meRes.status})`);
  const meData = await meRes.json();
  assert(meData.email === ADMIN_EMAIL, `Profile email matches ${ADMIN_EMAIL}`);
  const adminId = meData.id;
  const orgId = meData.organization_id;

  // 4. Create Vehicle
  const vehiclePlate = `KA-01-E2E-${Math.floor(1000 + Math.random() * 9000)}`;
  const vehicleRes = await fetch(`${APP_URL}/api/v1/vehicles`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      make: 'Tesla',
      model: 'Model 3',
      year: 2024,
      license_plate: vehiclePlate,
      total_seats: 4,
      color: 'Midnight Silver',
    }),
  });
  const vehicleData = await vehicleRes.json();
  assert(vehicleRes.status === 201, `POST /api/v1/vehicles returns 201 (got ${vehicleRes.status}: ${JSON.stringify(vehicleData)})`);
  assert(vehicleData.license_plate === vehiclePlate, `Vehicle registered with plate ${vehiclePlate}`);
  const vehicleId = vehicleData.id;

  // 5. Create Ride
  const depTime = new Date(Date.now() + 86400000 * 2).toISOString(); // +2 days
  const arrTime = new Date(Date.now() + 86400000 * 2 + 3600000).toISOString();
  const rideRes = await fetch(`${APP_URL}/api/v1/rides`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      vehicle_id: vehicleId,
      departure_time: depTime,
      arrival_time_estimated: arrTime,
      total_seats_offered: 3,
      cost_per_seat_cents: 500,
      notes: 'Office commute via Silk Board',
      route: {
        origin_address: 'HSR Layout Sector 1, Bengaluru',
        origin_latitude: 12.9121,
        origin_longitude: 77.6446,
        destination_address: 'Electronic City Phase 1, Bengaluru',
        destination_latitude: 12.8452,
        destination_longitude: 77.6602,
        total_distance_meters: 15000,
        total_duration_seconds: 1800,
        waypoints: [
          {
            stop_order: 1,
            point_type: 'ORIGIN',
            address_text: 'HSR Layout Sector 1',
            latitude: 12.9121,
            longitude: 77.6446,
            estimated_arrival_offset_seconds: 0,
          },
          {
            stop_order: 2,
            point_type: 'CORRIDOR',
            address_text: 'Silk Board Junction',
            latitude: 12.9172,
            longitude: 77.6228,
            estimated_arrival_offset_seconds: 600,
          },
          {
            stop_order: 3,
            point_type: 'DESTINATION',
            address_text: 'Electronic City Phase 1',
            latitude: 12.8452,
            longitude: 77.6602,
            estimated_arrival_offset_seconds: 1800,
          },
        ],
      },
    }),
  });
  const rideData = await rideRes.json();
  assert(rideRes.status === 201, `POST /api/v1/rides returns 201 (got ${rideRes.status}: ${JSON.stringify(rideData)})`);
  assert(!!rideData.ride?.id, `Ride created successfully`);
  const rideId = rideData.ride.id;

  // 6. Search Rides
  const rideDate = depTime.split('T')[0];
  const searchRes = await fetch(
    `${APP_URL}/api/v1/rides/search?origin_lat=12.9121&origin_lng=77.6446&dest_lat=12.8452&dest_lng=77.6602&date=${rideDate}&max_detour_meters=5000`,
    { headers: authHeaders }
  );
  assert(searchRes.ok, `GET /api/v1/rides/search returns 200 (got ${searchRes.status})`);
  const searchData = await searchRes.json();
  assert(searchData.rides?.length > 0, `Ride search returned at least 1 match (found ${searchData.rides?.length})`);

  // 7. Create a Passenger & Ride Request
  // Invite a new passenger to Acme Corp
  const passengerEmail = `passenger-${Date.now()}@acme.com`;
  const inviteRes = await fetch(`${APP_URL}/api/v1/admin/users/invite`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      email: passengerEmail,
      full_name: 'Test Passenger',
      role: 'EMPLOYEE',
    }),
  });
  assert(inviteRes.status === 201, `Invite passenger returns 201 (got ${inviteRes.status})`);
  const inviteData = await inviteRes.json();
  const activationToken = inviteData.invitation?.token;
  assert(!!activationToken, `Invitation token generated`);

  // Activate passenger
  const passengerPass = 'PassengerPass123!';
  const activateRes = await fetch(`${APP_URL}/api/v1/auth/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: activationToken, password: passengerPass }),
  });
  assert(activateRes.ok, `Activate passenger returns 200 (got ${activateRes.status})`);
  const activateData = await activateRes.json();
  const passengerJwt = activateData.token;
  assert(!!passengerJwt, `Passenger activated and received JWT`);
  const passengerHeaders = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${passengerJwt}`,
  };

  // Passenger requests a seat
  const reqRes = await fetch(`${APP_URL}/api/v1/rides/${rideId}/requests`, {
    method: 'POST',
    headers: passengerHeaders,
    body: JSON.stringify({
      requested_seats: 1,
      pickup_point: {
        address_text: 'Silk Board Junction',
        latitude: 12.9172,
        longitude: 77.6228,
      },
      drop_point: {
        address_text: 'Infosys Gate 1',
        latitude: 12.8452,
        longitude: 77.6602,
      },
    }),
  });
  const reqData = await reqRes.json();
  assert(reqRes.status === 202, `POST /rides/:id/requests returns 202 (got ${reqRes.status}: ${JSON.stringify(reqData)})`);
  const requestId = reqData.id;
  assert(reqData.status === 'PENDING', `Ride request status is PENDING`);

  // 8. Driver accepts Ride Request (Pessimistic Locking in PostgreSQL)
  const acceptRes = await fetch(`${APP_URL}/api/v1/ride-requests/${requestId}/accept`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({}),
  });
  const acceptData = await acceptRes.json();
  assert(acceptRes.ok, `POST /ride-requests/:id/accept returns 200 (got ${acceptRes.status}: ${JSON.stringify(acceptData)})`);
  assert(acceptData.request?.status === 'ACCEPTED', `Ride request status is now ACCEPTED`);
  assert(acceptData.ride?.available_seats === 2, `Available seats decremented from 3 to 2`);

  // 9. Notifications check
  const notifRes = await fetch(`${APP_URL}/api/v1/notifications`, { headers: passengerHeaders });
  assert(notifRes.ok, `GET /api/v1/notifications returns 200 for passenger`);
  const notifData = await notifRes.json();
  assert(notifData.notifications?.some(n => n.type === 'REQUEST_ACCEPTED'), `Passenger received REQUEST_ACCEPTED notification`);

  // 10. Places API Autocomplete
  const placesRes = await fetch(`${APP_URL}/api/v1/routing/places?input=Bengaluru`, { headers: authHeaders });
  assert(placesRes.ok, `GET /api/v1/routing/places returns 200 (got ${placesRes.status})`);
  const placesData = await placesRes.json();
  assert(Array.isArray(placesData.predictions), `Places API returned predictions array`);

  // 11. Directions API
  const directionsRes = await fetch(`${APP_URL}/api/v1/routing/directions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      origin: { lat: 12.9121, lng: 77.6446 },
      destination: { lat: 12.8452, lng: 77.6602 },
    }),
  });
  assert(directionsRes.ok, `POST /api/v1/routing/directions returns 200 (got ${directionsRes.status})`);
  const directionsData = await directionsRes.json();
  assert(Array.isArray(directionsData.routes) && directionsData.routes.length > 0, `Directions API returned real routes`);

  // 12. Cron Expiration Worker
  const cronRes = await fetch(`${APP_URL}/api/v1/system/cron/expire`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
  });
  assert(cronRes.ok, `POST /api/v1/system/cron/expire returns 200 (got ${cronRes.status})`);
  const cronData = await cronRes.json();
  assert(cronData.success === true, `Cron worker execution succeeded`);

  console.log(`\n========================================`);
  console.log(`E2E LOCAL VERIFICATION RESULTS:`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log(`ALL 12/12 INTEGRATION CHECKS PASSED ON LOCAL ENVIRONMENT!\n`);
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('\nFatal test error:', err);
  process.exit(1);
});
