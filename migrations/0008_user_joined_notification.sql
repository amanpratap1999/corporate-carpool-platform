-- Safely add USER_JOINED to notification_type enum without destroying existing data
ALTER TYPE "public"."notification_type" ADD VALUE IF NOT EXISTS 'USER_JOINED';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'USER_JOINED';
