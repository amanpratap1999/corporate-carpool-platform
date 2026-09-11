CREATE TYPE "public"."audit_action" AS ENUM('CREATE', 'UPDATE', 'STATE_TRANSITION', 'DELETE', 'CANCEL');--> statement-breakpoint
CREATE TYPE "public"."notification_channel" AS ENUM('IN_APP', 'EMAIL', 'SMS', 'PUSH');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('RIDE_REQUESTED', 'REQUEST_ACCEPTED', 'REQUEST_REJECTED', 'REQUEST_CANCELLED', 'RIDE_CANCELLED', 'RIDE_STARTED', 'RIDE_COMPLETED', 'SYSTEM_ANNOUNCEMENT', 'USER_JOINED');--> statement-breakpoint
CREATE TYPE "public"."ride_request_status" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'COMPLETED');--> statement-breakpoint
CREATE TYPE "public"."ride_status" AS ENUM('DRAFT', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('ACTIVE', 'INACTIVE', 'PENDING_INSPECTION');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('CAR', 'MOTORCYCLE', 'VAN');--> statement-breakpoint
CREATE TYPE "public"."waypoint_type" AS ENUM('ORIGIN', 'CORRIDOR', 'DESTINATION', 'PASSENGER_STOP');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"actor_user_id" uuid,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" "audit_action" NOT NULL,
	"from_state" varchar(50),
	"to_state" varchar(50),
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drop_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"passenger_id" uuid NOT NULL,
	"address_text" text NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"place_id" varchar(255),
	"landmark_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"channel" "notification_channel" DEFAULT 'IN_APP' NOT NULL,
	"title" varchar(255) NOT NULL,
	"body" text NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"read_at" timestamp with time zone,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"slug" varchar(100) NOT NULL,
	"allowed_email_domains" text[] NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pickup_points" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"passenger_id" uuid NOT NULL,
	"address_text" text NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"place_id" varchar(255),
	"landmark_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_passengers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ride_id" uuid NOT NULL,
	"passenger_id" uuid NOT NULL,
	"ride_request_id" uuid NOT NULL,
	"seats_allocated" smallint NOT NULL,
	"cost_charged_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_passengers_ride_request_id_unique" UNIQUE("ride_request_id")
);
--> statement-breakpoint
CREATE TABLE "ride_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"ride_id" uuid NOT NULL,
	"passenger_id" uuid NOT NULL,
	"pickup_point_id" uuid NOT NULL,
	"drop_point_id" uuid NOT NULL,
	"requested_seats" smallint DEFAULT 1 NOT NULL,
	"status" "ride_request_status" DEFAULT 'PENDING' NOT NULL,
	"rider_note" text,
	"rejection_reason" text,
	"cancellation_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ride_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ride_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"origin_address" text NOT NULL,
	"origin_latitude" numeric(10, 7) NOT NULL,
	"origin_longitude" numeric(10, 7) NOT NULL,
	"destination_address" text NOT NULL,
	"destination_latitude" numeric(10, 7) NOT NULL,
	"destination_longitude" numeric(10, 7) NOT NULL,
	"total_distance_meters" integer NOT NULL,
	"total_duration_seconds" integer NOT NULL,
	"min_latitude" numeric(10, 7) NOT NULL,
	"max_latitude" numeric(10, 7) NOT NULL,
	"min_longitude" numeric(10, 7) NOT NULL,
	"max_longitude" numeric(10, 7) NOT NULL,
	"bounding_box" jsonb NOT NULL,
	"google_route_id" varchar(255),
	"encoded_polyline" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ride_routes_ride_id_unique" UNIQUE("ride_id")
);
--> statement-breakpoint
CREATE TABLE "rides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"driver_id" uuid NOT NULL,
	"vehicle_id" uuid NOT NULL,
	"status" "ride_status" DEFAULT 'DRAFT' NOT NULL,
	"departure_time" timestamp with time zone NOT NULL,
	"arrival_time_estimated" timestamp with time zone NOT NULL,
	"total_seats_offered" smallint NOT NULL,
	"available_seats" smallint NOT NULL,
	"cost_per_seat_cents" integer DEFAULT 0 NOT NULL,
	"currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"notes" text,
	"cancelled_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "route_waypoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"stop_order" smallint NOT NULL,
	"point_type" "waypoint_type" NOT NULL,
	"address_text" text,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"place_id" varchar(255),
	"estimated_arrival_offset_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_capabilities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"can_ride" boolean DEFAULT true NOT NULL,
	"can_drive" boolean DEFAULT false NOT NULL,
	"is_org_admin" boolean DEFAULT false NOT NULL,
	"driver_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_capabilities_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "user_locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"label" varchar(100) NOT NULL,
	"address_text" text NOT NULL,
	"latitude" numeric(10, 7) NOT NULL,
	"longitude" numeric(10, 7) NOT NULL,
	"place_id" varchar(255),
	"is_default_pickup" boolean DEFAULT false NOT NULL,
	"is_default_drop" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"email" varchar(255) NOT NULL,
	"full_name" varchar(255) NOT NULL,
	"phone_number" varchar(50),
	"avatar_url" text,
	"status" "user_status" DEFAULT 'ACTIVE' NOT NULL,
	"work_department" varchar(100),
	"work_location" varchar(255),
	"password_hash" varchar(255),
	"external_idp_sub" varchar(255),
	"invitation_token" varchar(100),
	"invitation_expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"make" varchar(100) NOT NULL,
	"model" varchar(100) NOT NULL,
	"year" smallint NOT NULL,
	"color" varchar(50) NOT NULL,
	"license_plate" varchar(20) NOT NULL,
	"total_seats" smallint NOT NULL,
	"vehicle_type" "vehicle_type" DEFAULT 'CAR' NOT NULL,
	"max_passenger_capacity" smallint DEFAULT 4 NOT NULL,
	"status" "vehicle_status" DEFAULT 'ACTIVE' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_points" ADD CONSTRAINT "drop_points_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drop_points" ADD CONSTRAINT "drop_points_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_points" ADD CONSTRAINT "pickup_points_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_points" ADD CONSTRAINT "pickup_points_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_passengers" ADD CONSTRAINT "ride_passengers_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_passengers" ADD CONSTRAINT "ride_passengers_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_passengers" ADD CONSTRAINT "ride_passengers_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_passengers" ADD CONSTRAINT "ride_passengers_ride_request_id_ride_requests_id_fk" FOREIGN KEY ("ride_request_id") REFERENCES "public"."ride_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_passenger_id_users_id_fk" FOREIGN KEY ("passenger_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_pickup_point_id_pickup_points_id_fk" FOREIGN KEY ("pickup_point_id") REFERENCES "public"."pickup_points"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_requests" ADD CONSTRAINT "ride_requests_drop_point_id_drop_points_id_fk" FOREIGN KEY ("drop_point_id") REFERENCES "public"."drop_points"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_routes" ADD CONSTRAINT "ride_routes_ride_id_rides_id_fk" FOREIGN KEY ("ride_id") REFERENCES "public"."rides"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ride_routes" ADD CONSTRAINT "ride_routes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_driver_id_users_id_fk" FOREIGN KEY ("driver_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rides" ADD CONSTRAINT "rides_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_waypoints" ADD CONSTRAINT "route_waypoints_route_id_ride_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."ride_routes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "route_waypoints" ADD CONSTRAINT "route_waypoints_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_capabilities" ADD CONSTRAINT "user_capabilities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_capabilities" ADD CONSTRAINT "user_capabilities_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_locations" ADD CONSTRAINT "user_locations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_logs_org" ON "audit_logs" USING btree ("organization_id","created_at","entity_type");--> statement-breakpoint
CREATE INDEX "idx_notifications_user" ON "notifications" USING btree ("user_id","read_at","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_ride_passengers_ride_user" ON "ride_passengers" USING btree ("ride_id","passenger_id");--> statement-breakpoint
CREATE INDEX "idx_ride_requests_ride" ON "ride_requests" USING btree ("ride_id","status");--> statement-breakpoint
CREATE INDEX "idx_ride_requests_passenger" ON "ride_requests" USING btree ("passenger_id","status");--> statement-breakpoint
CREATE INDEX "idx_ride_routes_bbox" ON "ride_routes" USING btree ("min_latitude","max_latitude","min_longitude","max_longitude");--> statement-breakpoint
CREATE INDEX "idx_rides_org_departure" ON "rides" USING btree ("organization_id","departure_time","status");--> statement-breakpoint
CREATE INDEX "idx_rides_driver" ON "rides" USING btree ("driver_id","departure_time");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_route_waypoints_order" ON "route_waypoints" USING btree ("route_id","stop_order");--> statement-breakpoint
CREATE INDEX "idx_route_waypoints_coords" ON "route_waypoints" USING btree ("latitude","longitude");--> statement-breakpoint
CREATE INDEX "idx_user_capabilities_driver" ON "user_capabilities" USING btree ("organization_id","can_drive");--> statement-breakpoint
CREATE INDEX "idx_user_locations_user" ON "user_locations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_users_org_email" ON "users" USING btree ("organization_id","email");--> statement-breakpoint
CREATE INDEX "idx_users_org_status" ON "users" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "idx_users_invitation_token" ON "users" USING btree ("invitation_token");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_vehicles_org_plate" ON "vehicles" USING btree ("organization_id","license_plate");--> statement-breakpoint
CREATE INDEX "idx_vehicles_owner" ON "vehicles" USING btree ("owner_id");