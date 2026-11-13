-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

create schema if not exists "auth";

create table if not exists "auth"."user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "email_verified" boolean not null, "image" text, "created_at" timestamptz default CURRENT_TIMESTAMP not null, "updated_at" timestamptz default CURRENT_TIMESTAMP not null, "role" text, "banned" boolean, "ban_reason" text, "ban_expires" timestamptz, "two_factor_enabled" boolean);

create table if not exists "auth"."session" ("id" text not null primary key, "expires_at" timestamptz not null, "token" text not null unique, "created_at" timestamptz default CURRENT_TIMESTAMP not null, "updated_at" timestamptz not null, "ip_address" text, "user_agent" text, "user_id" text not null references "auth"."user" ("id") on delete cascade, "impersonated_by" text);

create table if not exists "auth"."account" ("id" text not null primary key, "account_id" text not null, "provider_id" text not null, "user_id" text not null references "auth"."user" ("id") on delete cascade, "access_token" text, "refresh_token" text, "id_token" text, "access_token_expires_at" timestamptz, "refresh_token_expires_at" timestamptz, "scope" text, "password" text, "created_at" timestamptz default CURRENT_TIMESTAMP not null, "updated_at" timestamptz not null);

create table if not exists "auth"."verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expires_at" timestamptz not null, "created_at" timestamptz default CURRENT_TIMESTAMP not null, "updated_at" timestamptz default CURRENT_TIMESTAMP not null);

create table if not exists "auth"."jwks" ("id" text not null primary key, "public_key" text not null, "private_key" text not null, "created_at" timestamptz not null, "expires_at" timestamptz, "alg" text, "crv" text);

create table if not exists "auth"."two_factor" ("id" text not null primary key, "secret" text not null, "backup_codes" text not null, "user_id" text not null references "auth"."user" ("id") on delete cascade, "verified" boolean, "failed_verification_count" integer, "locked_until" timestamptz);

create table if not exists "auth"."passkey" ("id" text not null primary key, "name" text, "public_key" text not null, "user_id" text not null references "auth"."user" ("id") on delete cascade, "credential_id" text not null, "counter" integer not null, "device_type" text not null, "backed_up" boolean not null, "transports" text, "created_at" timestamptz, "aaguid" text);

create table if not exists "auth"."sign_in_policy" ("id" text not null primary key, "password" text not null, "email_code" text not null, "passkey" text not null, "two_factor" text not null, "staff_access" text not null, "platform_sign_in" text not null, "created_at" timestamptz not null, "created_by" text);

create table if not exists "auth"."staff_sign_in" ("id" text not null primary key, "user_id" text not null, "user_email" text not null, "staff" text not null, "staff_name" text, "staff_subject" text not null, "issuer" text not null, "reason" text not null, "session_id" text not null, "started_at" timestamptz not null, "expires_at" timestamptz not null, "ended_at" timestamptz);

create index if not exists "session_user_id_idx" on "auth"."session" ("user_id");

create index if not exists "account_user_id_idx" on "auth"."account" ("user_id");

create index if not exists "verification_identifier_idx" on "auth"."verification" ("identifier");

create index if not exists "two_factor_secret_idx" on "auth"."two_factor" ("secret");

create index if not exists "two_factor_user_id_idx" on "auth"."two_factor" ("user_id");

create index if not exists "passkey_user_id_idx" on "auth"."passkey" ("user_id");

create index if not exists "passkey_credential_id_idx" on "auth"."passkey" ("credential_id");
