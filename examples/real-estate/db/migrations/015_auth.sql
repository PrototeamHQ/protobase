-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

-- The record of the auth store's migrations.
create schema if not exists "auth";

create table "auth"."auth_migrations" (
  version integer primary key,
  name text not null,
  applied_at timestamptz default current_timestamp not null
);

-- The auth store an earlier Protobase made, without a record of its migrations, adopted: 1 core, 2 two_factor, 3 passkeys, 4 sign_in_policy, 5 staff_sign_in
-- recorded as applied, once every table and column they make is there.
do $adopt$
declare
  missing text;
begin
  select string_agg(expected.table_name || '.' || expected.column_name, ', ' order by expected.table_name, expected.column_name) into missing
  from (values ('account', 'id', 'text'),
    ('account', 'account_id', 'text'),
    ('account', 'provider_id', 'text'),
    ('account', 'user_id', 'text'),
    ('account', 'access_token', 'text'),
    ('account', 'refresh_token', 'text'),
    ('account', 'id_token', 'text'),
    ('account', 'access_token_expires_at', 'timestamptz'),
    ('account', 'refresh_token_expires_at', 'timestamptz'),
    ('account', 'scope', 'text'),
    ('account', 'password', 'text'),
    ('account', 'created_at', 'timestamptz'),
    ('account', 'updated_at', 'timestamptz'),
    ('jwks', 'id', 'text'),
    ('jwks', 'public_key', 'text'),
    ('jwks', 'private_key', 'text'),
    ('jwks', 'created_at', 'timestamptz'),
    ('jwks', 'expires_at', 'timestamptz'),
    ('jwks', 'alg', 'text'),
    ('jwks', 'crv', 'text'),
    ('session', 'id', 'text'),
    ('session', 'expires_at', 'timestamptz'),
    ('session', 'token', 'text'),
    ('session', 'created_at', 'timestamptz'),
    ('session', 'updated_at', 'timestamptz'),
    ('session', 'ip_address', 'text'),
    ('session', 'user_agent', 'text'),
    ('session', 'user_id', 'text'),
    ('session', 'impersonated_by', 'text'),
    ('session', 'active_role', 'text'),
    ('user', 'id', 'text'),
    ('user', 'name', 'text'),
    ('user', 'email', 'text'),
    ('user', 'email_verified', 'bool'),
    ('user', 'image', 'text'),
    ('user', 'created_at', 'timestamptz'),
    ('user', 'updated_at', 'timestamptz'),
    ('user', 'role', 'text'),
    ('user', 'banned', 'bool'),
    ('user', 'ban_reason', 'text'),
    ('user', 'ban_expires', 'timestamptz'),
    ('user', 'last_role', 'text'),
    ('user', 'email_confirmed_at', 'timestamptz'),
    ('verification', 'id', 'text'),
    ('verification', 'identifier', 'text'),
    ('verification', 'value', 'text'),
    ('verification', 'expires_at', 'timestamptz'),
    ('verification', 'created_at', 'timestamptz'),
    ('verification', 'updated_at', 'timestamptz'),
    ('two_factor', 'id', 'text'),
    ('two_factor', 'secret', 'text'),
    ('two_factor', 'backup_codes', 'text'),
    ('two_factor', 'user_id', 'text'),
    ('two_factor', 'verified', 'bool'),
    ('two_factor', 'failed_verification_count', 'int4'),
    ('two_factor', 'locked_until', 'timestamptz'),
    ('user', 'two_factor_enabled', 'bool'),
    ('passkey', 'id', 'text'),
    ('passkey', 'name', 'text'),
    ('passkey', 'public_key', 'text'),
    ('passkey', 'user_id', 'text'),
    ('passkey', 'credential_id', 'text'),
    ('passkey', 'counter', 'int4'),
    ('passkey', 'device_type', 'text'),
    ('passkey', 'backed_up', 'bool'),
    ('passkey', 'transports', 'text'),
    ('passkey', 'created_at', 'timestamptz'),
    ('passkey', 'aaguid', 'text'),
    ('passkey', 'rp_id', 'text'),
    ('sign_in_policy', 'id', 'text'),
    ('sign_in_policy', 'password', 'text'),
    ('sign_in_policy', 'email_code', 'text'),
    ('sign_in_policy', 'passkey', 'text'),
    ('sign_in_policy', 'two_factor', 'text'),
    ('sign_in_policy', 'staff_access', 'text'),
    ('sign_in_policy', 'platform_sign_in', 'text'),
    ('sign_in_policy', 'created_at', 'timestamptz'),
    ('sign_in_policy', 'created_by', 'text'),
    ('staff_sign_in', 'id', 'text'),
    ('staff_sign_in', 'user_id', 'text'),
    ('staff_sign_in', 'user_email', 'text'),
    ('staff_sign_in', 'staff', 'text'),
    ('staff_sign_in', 'staff_name', 'text'),
    ('staff_sign_in', 'staff_subject', 'text'),
    ('staff_sign_in', 'issuer', 'text'),
    ('staff_sign_in', 'reason', 'text'),
    ('staff_sign_in', 'session_id', 'text'),
    ('staff_sign_in', 'started_at', 'timestamptz'),
    ('staff_sign_in', 'expires_at', 'timestamptz'),
    ('staff_sign_in', 'ended_at', 'timestamptz')) as expected (table_name, column_name, udt_name)
  where not exists (
    select from information_schema.columns found
    where found.table_schema = 'auth' and found.table_name = expected.table_name and found.column_name = expected.column_name and found.udt_name = expected.udt_name
  );
  if missing is not null then
    raise exception 'The auth store does not match the migrations this file adopts: it lacks %, or has them as other types', missing;
  end if;
end
$adopt$;

insert into "auth"."auth_migrations" (version, name) values (1, 'core'), (2, 'two_factor'), (3, 'passkeys'), (4, 'sign_in_policy'), (5, 'staff_sign_in');

-- 6 organizations: Organizations, their members and their invitations.
alter table "auth"."user" add column if not exists "last_organization_id" text;

alter table "auth"."session" add column active_organization_id text;

create table "auth"."organization" (
  id text primary key,
  name text not null,
  slug text not null unique,
  logo text,
  created_at timestamptz not null,
  metadata text
);

create table "auth"."member" (
  id text primary key,
  organization_id text not null references "auth"."organization" (id) on delete cascade,
  user_id text not null references "auth"."user" (id) on delete cascade,
  role text not null,
  created_at timestamptz not null,
  app_roles jsonb
);

create index member_organization_id_idx on "auth"."member" (organization_id);

create index member_user_id_idx on "auth"."member" (user_id);

create table "auth"."invitation" (
  id text primary key,
  organization_id text not null references "auth"."organization" (id) on delete cascade,
  email text not null,
  role text,
  status text not null,
  expires_at timestamptz not null,
  created_at timestamptz default current_timestamp not null,
  inviter_id text not null references "auth"."user" (id) on delete cascade,
  app_roles jsonb
);

create index invitation_organization_id_idx on "auth"."invitation" (organization_id);

create index invitation_email_idx on "auth"."invitation" (email);

insert into "auth"."auth_migrations" (version, name) values (6, 'organizations');

-- 7 mcp: The clients, resources, tokens and consents of the OAuth provider for MCP.
create table "auth"."oauth_client" (
  id text primary key,
  client_id text not null unique,
  client_secret text,
  client_discovery_id text,
  disabled boolean,
  skip_consent boolean,
  enable_end_session boolean,
  subject_type text,
  scopes jsonb,
  client_credentials_scopes jsonb,
  user_id text references "auth"."user" (id) on delete cascade,
  created_at timestamptz,
  updated_at timestamptz,
  name text,
  uri text,
  icon text,
  contacts jsonb,
  tos text,
  policy text,
  software_id text,
  software_version text,
  software_statement text,
  redirect_uris jsonb not null,
  post_logout_redirect_uris jsonb,
  backchannel_logout_uri text,
  backchannel_logout_session_required boolean,
  token_endpoint_auth_method text,
  application_type text,
  jwks text,
  jwks_uri text,
  grant_types jsonb,
  response_types jsonb,
  require_pkce boolean,
  dpop_bound_access_tokens boolean,
  reference_id text,
  metadata jsonb
);

create index oauth_client_user_id_idx on "auth"."oauth_client" (user_id);

create table "auth"."oauth_resource" (
  id text primary key,
  identifier text not null unique,
  name text not null,
  access_token_ttl integer,
  refresh_token_ttl integer,
  signing_algorithm text,
  signing_key_id text,
  allowed_scopes jsonb,
  custom_claims jsonb,
  dpop_bound_access_tokens_required boolean,
  disabled boolean,
  created_at timestamptz,
  updated_at timestamptz,
  policy_version integer,
  metadata jsonb
);

create table "auth"."oauth_client_resource" (
  id text primary key,
  client_id text not null references "auth"."oauth_client" (client_id) on delete cascade,
  resource_id text not null references "auth"."oauth_resource" (identifier) on delete cascade,
  metadata jsonb,
  created_at timestamptz
);

create index oauth_client_resource_client_id_idx on "auth"."oauth_client_resource" (client_id);

create index oauth_client_resource_resource_id_idx on "auth"."oauth_client_resource" (resource_id);

create unique index oauth_client_resource_client_id_resource_id_uidx on "auth"."oauth_client_resource" (client_id, resource_id);

create table "auth"."oauth_refresh_token" (
  id text primary key,
  token text not null unique,
  client_id text not null references "auth"."oauth_client" (client_id) on delete cascade,
  session_id text references "auth"."session" (id) on delete set null,
  user_id text not null references "auth"."user" (id) on delete cascade,
  reference_id text,
  authorization_code_id text,
  resources jsonb,
  requested_user_info_claims jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  revoked timestamptz,
  rotated_at timestamptz,
  rotation_replay_response text,
  rotation_replay_expires_at timestamptz,
  auth_time timestamptz,
  confirmation jsonb,
  scopes jsonb not null
);

create index oauth_refresh_token_client_id_idx on "auth"."oauth_refresh_token" (client_id);

create index oauth_refresh_token_session_id_idx on "auth"."oauth_refresh_token" (session_id);

create index oauth_refresh_token_user_id_idx on "auth"."oauth_refresh_token" (user_id);

create index oauth_refresh_token_authorization_code_id_idx on "auth"."oauth_refresh_token" (authorization_code_id);

create table "auth"."oauth_access_token" (
  id text primary key,
  token text not null unique,
  client_id text not null references "auth"."oauth_client" (client_id) on delete cascade,
  session_id text references "auth"."session" (id) on delete set null,
  user_id text references "auth"."user" (id) on delete cascade,
  reference_id text,
  authorization_code_id text,
  resources jsonb,
  requested_user_info_claims jsonb,
  refresh_id text references "auth"."oauth_refresh_token" (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null,
  revoked timestamptz,
  confirmation jsonb,
  scopes jsonb not null
);

create index oauth_access_token_client_id_idx on "auth"."oauth_access_token" (client_id);

create index oauth_access_token_session_id_idx on "auth"."oauth_access_token" (session_id);

create index oauth_access_token_user_id_idx on "auth"."oauth_access_token" (user_id);

create index oauth_access_token_authorization_code_id_idx on "auth"."oauth_access_token" (authorization_code_id);

create index oauth_access_token_refresh_id_idx on "auth"."oauth_access_token" (refresh_id);

create table "auth"."oauth_consent" (
  id text primary key,
  client_id text not null references "auth"."oauth_client" (client_id) on delete cascade,
  user_id text references "auth"."user" (id) on delete cascade,
  reference_id text,
  resources jsonb,
  requested_user_info_claims jsonb,
  scopes jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index oauth_consent_client_id_idx on "auth"."oauth_consent" (client_id);

create index oauth_consent_user_id_idx on "auth"."oauth_consent" (user_id);

create table "auth"."oauth_client_assertion" (
  id text primary key,
  expires_at timestamptz not null
);

insert into "auth"."auth_migrations" (version, name) values (7, 'mcp');
