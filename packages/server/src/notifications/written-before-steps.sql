create schema if not exists "notifications";

create table "notifications"."devices" (
  "id" uuid primary key,
  "user_id" text not null,
  "kind" text not null check ("kind" in ('web', 'apns', 'fcm', 'relay')),
  "token" text not null,
  "p256dh" text,
  "auth" text,
  "environment" text check ("environment" in ('sandbox', 'production')),
  "app_id" text,
  "user_agent" text,
  "session_id" text,
  "created_at" timestamptz not null,
  "last_seen_at" timestamptz not null,
  check (
    ("kind" = 'web' and "p256dh" is not null and "auth" is not null and "environment" is null and "app_id" is null)
    or ("kind" = 'apns' and "p256dh" is null and "auth" is null and "environment" is not null and "app_id" is not null)
    or ("kind" = 'fcm' and "p256dh" is null and "auth" is null and "environment" is null)
    or ("kind" = 'relay' and "p256dh" is null and "auth" is null and "environment" is null and "app_id" is null)
  )
);

create unique index on "notifications"."devices" ("token");

create index on "notifications"."devices" ("user_id");

create table "notifications"."history" (
  "id" uuid primary key,
  "user_id" text not null,
  "title" text not null,
  "body" text,
  "url" text,
  "data" jsonb,
  "created_at" timestamptz not null,
  "read_at" timestamptz
);

create index on "notifications"."history" ("user_id", "created_at" desc, "id" desc);

create index on "notifications"."history" ("user_id", "created_at") where "read_at" is null;
