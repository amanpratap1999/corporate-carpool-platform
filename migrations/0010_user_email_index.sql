CREATE UNIQUE INDEX IF NOT EXISTS uq_users_org_lower_email ON users (organization_id, lower(email));

