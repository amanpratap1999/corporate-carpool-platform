import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  smallint,
  boolean,
  timestamp,
  numeric,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ----------------------------------------------------------------------------
// Enums
// ----------------------------------------------------------------------------

export const userStatusEnum = pgEnum('user_status', [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'PENDING_VERIFICATION',
]);

export const vehicleStatusEnum = pgEnum('vehicle_status', [
  'ACTIVE',
  'INACTIVE',
  'PENDING_INSPECTION',
]);

export const vehicleTypeEnum = pgEnum('vehicle_type', [
  'CAR',
  'MOTORCYCLE',
  'VAN',
]);

export const rideStatusEnum = pgEnum('ride_status', [
  'DRAFT',
  'SCHEDULED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
]);

export const rideRequestStatusEnum = pgEnum('ride_request_status', [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'COMPLETED',
]);

export const waypointTypeEnum = pgEnum('waypoint_type', [
  'ORIGIN',
  'CORRIDOR',
  'DESTINATION',
  'PASSENGER_STOP',
]);

export const notificationTypeEnum = pgEnum('notification_type', [
  'RIDE_REQUESTED',
  'REQUEST_ACCEPTED',
  'REQUEST_REJECTED',
  'REQUEST_CANCELLED',
  'RIDE_CANCELLED',
  'RIDE_STARTED',
  'RIDE_COMPLETED',
  'SYSTEM_ANNOUNCEMENT',
  'USER_JOINED',
]);

export const notificationChannelEnum = pgEnum('notification_channel', [
  'IN_APP',
  'EMAIL',
  'SMS',
  'PUSH',
]);

export const auditActionEnum = pgEnum('audit_action', [
  'CREATE',
  'UPDATE',
  'STATE_TRANSITION',
  'DELETE',
  'CANCEL',
]);

// ----------------------------------------------------------------------------
// Tables
// ----------------------------------------------------------------------------

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  allowed_email_domains: text('allowed_email_domains').array().notNull(),
  settings: jsonb('settings').default({}).notNull(),
  is_active: boolean('is_active').default(true).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    email: varchar('email', { length: 255 }).notNull(),
    full_name: varchar('full_name', { length: 255 }).notNull(),
    phone_number: varchar('phone_number', { length: 50 }),
    avatar_url: text('avatar_url'),
    status: userStatusEnum('status').default('ACTIVE').notNull(),
    work_department: varchar('work_department', { length: 100 }),
    work_location: varchar('work_location', { length: 255 }),
    password_hash: varchar('password_hash', { length: 255 }),
    external_idp_sub: varchar('external_idp_sub', { length: 255 }),
    invitation_token: varchar('invitation_token', { length: 100 }),
    invitation_token_expires_at: timestamp('invitation_token_expires_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_users_org_email').on(table.organization_id, table.email),
    index('idx_users_org_status').on(table.organization_id, table.status),
    index('idx_users_invitation_token').on(table.invitation_token),
  ]
);

export const userCapabilities = pgTable(
  'user_capabilities',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    can_ride: boolean('can_ride').default(true).notNull(),
    can_drive: boolean('can_drive').default(false).notNull(),
    is_org_admin: boolean('is_org_admin').default(false).notNull(),
    driver_verified_at: timestamp('driver_verified_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_user_capabilities_driver').on(
      table.organization_id,
      table.can_drive
    ),
  ]
);

export const userLocations = pgTable(
  'user_locations',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    label: varchar('label', { length: 100 }).notNull(),
    address_text: text('address_text').notNull(),
    latitude: numeric('latitude', { precision: 10, scale: 7 }).notNull(),
    longitude: numeric('longitude', { precision: 10, scale: 7 }).notNull(),
    place_id: varchar('place_id', { length: 255 }),
    is_default_pickup: boolean('is_default_pickup').default(false).notNull(),
    is_default_drop: boolean('is_default_drop').default(false).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_user_locations_user').on(table.user_id),
  ]
);

export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    owner_id: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    make: varchar('make', { length: 100 }).notNull(),
    model: varchar('model', { length: 100 }).notNull(),
    year: smallint('year').notNull(),
    color: varchar('color', { length: 50 }).notNull(),
    license_plate: varchar('license_plate', { length: 20 }).notNull(),
    total_seats: smallint('total_seats').notNull(),
    vehicle_type: vehicleTypeEnum('vehicle_type').default('CAR').notNull(),
    max_passenger_capacity: smallint('max_passenger_capacity').default(4).notNull(),
    status: vehicleStatusEnum('status').default('ACTIVE').notNull(),
    verified_at: timestamp('verified_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_vehicles_org_plate').on(
      table.organization_id,
      table.license_plate
    ),
    index('idx_vehicles_owner').on(table.owner_id),
  ]
);

export const rides = pgTable(
  'rides',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    driver_id: uuid('driver_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    vehicle_id: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'restrict' }),
    status: rideStatusEnum('status').default('DRAFT').notNull(),
    departure_time: timestamp('departure_time', { withTimezone: true }).notNull(),
    arrival_time_estimated: timestamp('arrival_time_estimated', {
      withTimezone: true,
    }).notNull(),
    total_seats_offered: smallint('total_seats_offered').notNull(),
    available_seats: smallint('available_seats').notNull(),
    cost_per_seat_cents: integer('cost_per_seat_cents').default(0).notNull(),
    currency: varchar('currency', { length: 3 }).default('USD').notNull(),
    notes: text('notes'),
    cancelled_reason: text('cancelled_reason'),
    cancelled_at: timestamp('cancelled_at', { withTimezone: true }),
    started_at: timestamp('started_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_rides_org_departure').on(
      table.organization_id,
      table.departure_time,
      table.status
    ),
    index('idx_rides_driver').on(table.driver_id, table.departure_time),
    check('chk_available_seats_non_negative', sql`available_seats >= 0`),
    check('chk_available_seats_le_total', sql`available_seats <= total_seats_offered`),
    check('chk_total_seats_positive', sql`total_seats_offered > 0`),
  ]
);

export const rideRoutes = pgTable(
  'ride_routes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    ride_id: uuid('ride_id')
      .notNull()
      .unique()
      .references(() => rides.id, { onDelete: 'cascade' }),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    origin_address: text('origin_address').notNull(),
    origin_latitude: numeric('origin_latitude', { precision: 10, scale: 7 }).notNull(),
    origin_longitude: numeric('origin_longitude', { precision: 10, scale: 7 }).notNull(),
    destination_address: text('destination_address').notNull(),
    destination_latitude: numeric('destination_latitude', {
      precision: 10,
      scale: 7,
    }).notNull(),
    destination_longitude: numeric('destination_longitude', {
      precision: 10,
      scale: 7,
    }).notNull(),
    total_distance_meters: integer('total_distance_meters').notNull(),
    total_duration_seconds: integer('total_duration_seconds').notNull(),
    min_latitude: numeric('min_latitude', { precision: 10, scale: 7 }).notNull(),
    max_latitude: numeric('max_latitude', { precision: 10, scale: 7 }).notNull(),
    min_longitude: numeric('min_longitude', { precision: 10, scale: 7 }).notNull(),
    max_longitude: numeric('max_longitude', { precision: 10, scale: 7 }).notNull(),
    bounding_box: jsonb('bounding_box').notNull(),
    google_route_id: varchar('google_route_id', { length: 255 }),
    encoded_polyline: text('encoded_polyline'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_ride_routes_bbox').on(
      table.min_latitude,
      table.max_latitude,
      table.min_longitude,
      table.max_longitude
    ),
  ]
);

export const routeWaypoints = pgTable(
  'route_waypoints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    route_id: uuid('route_id')
      .notNull()
      .references(() => rideRoutes.id, { onDelete: 'cascade' }),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    stop_order: smallint('stop_order').notNull(),
    point_type: waypointTypeEnum('point_type').notNull(),
    address_text: text('address_text'),
    latitude: numeric('latitude', { precision: 10, scale: 7 }).notNull(),
    longitude: numeric('longitude', { precision: 10, scale: 7 }).notNull(),
    place_id: varchar('place_id', { length: 255 }),
    estimated_arrival_offset_seconds: integer('estimated_arrival_offset_seconds').default(0).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_route_waypoints_order').on(table.route_id, table.stop_order),
    index('idx_route_waypoints_coords').on(table.latitude, table.longitude),
  ]
);

export const pickupPoints = pgTable('pickup_points', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'restrict' }),
  passenger_id: uuid('passenger_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  address_text: text('address_text').notNull(),
  latitude: numeric('latitude', { precision: 10, scale: 7 }).notNull(),
  longitude: numeric('longitude', { precision: 10, scale: 7 }).notNull(),
  place_id: varchar('place_id', { length: 255 }),
  landmark_note: text('landmark_note'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const dropPoints = pgTable('drop_points', {
  id: uuid('id').defaultRandom().primaryKey(),
  organization_id: uuid('organization_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'restrict' }),
  passenger_id: uuid('passenger_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  address_text: text('address_text').notNull(),
  latitude: numeric('latitude', { precision: 10, scale: 7 }).notNull(),
  longitude: numeric('longitude', { precision: 10, scale: 7 }).notNull(),
  place_id: varchar('place_id', { length: 255 }),
  landmark_note: text('landmark_note'),
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const rideRequests = pgTable(
  'ride_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    ride_id: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'restrict' }),
    passenger_id: uuid('passenger_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    pickup_point_id: uuid('pickup_point_id')
      .notNull()
      .references(() => pickupPoints.id, { onDelete: 'restrict' }),
    drop_point_id: uuid('drop_point_id')
      .notNull()
      .references(() => dropPoints.id, { onDelete: 'restrict' }),
    requested_seats: smallint('requested_seats').default(1).notNull(),
    status: rideRequestStatusEnum('status').default('PENDING').notNull(),
    rider_note: text('rider_note'),
    rejection_reason: text('rejection_reason'),
    cancellation_reason: text('cancellation_reason'),
    responded_at: timestamp('responded_at', { withTimezone: true }),
    cancelled_at: timestamp('cancelled_at', { withTimezone: true }),
    version: integer('version').default(1).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_ride_requests_active_passenger')
      .on(table.ride_id, table.passenger_id)
      .where(sql`${table.status} IN ('PENDING', 'ACCEPTED')`),
    index('idx_ride_requests_ride').on(table.ride_id, table.status),
    index('idx_ride_requests_passenger').on(table.passenger_id, table.status),
  ]
);

export const ridePassengers = pgTable(
  'ride_passengers',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    ride_id: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'restrict' }),
    passenger_id: uuid('passenger_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    ride_request_id: uuid('ride_request_id')
      .notNull()
      .unique()
      .references(() => rideRequests.id, { onDelete: 'restrict' }),
    seats_booked: smallint('seats_booked').notNull(),
    cost_charged_cents: integer('cost_charged_cents').default(0).notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('uq_ride_passengers_ride_user').on(
      table.ride_id,
      table.passenger_id
    ),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    user_id: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: notificationTypeEnum('type').notNull(),
    channel: notificationChannelEnum('channel').default('IN_APP').notNull(),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body').notNull(),
    payload_json: jsonb('payload_json').default({}).notNull(),
    read_at: timestamp('read_at', { withTimezone: true }),
    sent_at: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_notifications_user').on(
      table.user_id,
      table.read_at,
      table.created_at
    ),
  ]
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organization_id: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'restrict' }),
    actor_user_id: uuid('actor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    entity_type: varchar('entity_type', { length: 50 }).notNull(),
    entity_id: uuid('entity_id').notNull(),
    action: auditActionEnum('action').notNull(),
    from_state: varchar('from_state', { length: 50 }),
    to_state: varchar('to_state', { length: 50 }),
    metadata_json: jsonb('metadata_json').default({}).notNull(),
    ip_address: varchar('ip_address', { length: 45 }),
    user_agent: text('user_agent'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('idx_audit_logs_org').on(
      table.organization_id,
      table.created_at,
      table.entity_type
    ),
  ]
);
