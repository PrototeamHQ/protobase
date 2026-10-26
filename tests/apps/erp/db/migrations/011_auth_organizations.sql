-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

create schema if not exists "auth";

alter table "auth"."user" add column if not exists "last_organization_id" text;

alter table "auth"."session" add column if not exists "active_organization_id" text;

create table if not exists "auth"."organization" ("id" text not null primary key, "name" text not null, "slug" text not null unique, "logo" text, "created_at" timestamptz not null, "metadata" text);

create table if not exists "auth"."member" ("id" text not null primary key, "organization_id" text not null references "auth"."organization" ("id") on delete cascade, "user_id" text not null references "auth"."user" ("id") on delete cascade, "role" text not null, "created_at" timestamptz not null, "app_roles" jsonb);

create table if not exists "auth"."invitation" ("id" text not null primary key, "organization_id" text not null references "auth"."organization" ("id") on delete cascade, "email" text not null, "role" text, "status" text not null, "expires_at" timestamptz not null, "created_at" timestamptz default CURRENT_TIMESTAMP not null, "inviter_id" text not null references "auth"."user" ("id") on delete cascade, "app_roles" jsonb);

create index if not exists "member_organization_id_idx" on "auth"."member" ("organization_id");

create index if not exists "member_user_id_idx" on "auth"."member" ("user_id");

create index if not exists "invitation_organization_id_idx" on "auth"."invitation" ("organization_id");

create index if not exists "invitation_email_idx" on "auth"."invitation" ("email");
