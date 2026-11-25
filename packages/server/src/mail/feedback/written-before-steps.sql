create schema if not exists "mail";

create table if not exists mail.feedback (
  "id" bigint generated always as identity primary key,
  "provider" text not null,
  "event_id" text not null,
  "type" text not null check ("type" in ('bounce', 'complaint')),
  "bounce_type" text check ("bounce_type" is null or ("bounce_type" in ('hard', 'soft') and "type" = 'bounce')),
  "recipient" text check ("recipient" = lower("recipient")),
  "message_id" text,
  "provider_message_id" text,
  "reason" text,
  "occurred_at" timestamptz,
  "created_at" timestamptz not null,
  constraint "feedback_names_recipient" check ("recipient" is not null or ("type" = 'complaint' and "message_id" is not null))
);

create unique index if not exists "feedback_provider_event_recipient_once" on mail.feedback ("provider", "event_id", "recipient") nulls not distinct;
create index if not exists "feedback_recipient" on mail.feedback ("recipient");
create index if not exists "feedback_message_id" on mail.feedback ("message_id");
create index if not exists "feedback_provider_message_id" on mail.feedback ("provider_message_id");
create index if not exists "feedback_type" on mail.feedback ("type");
create index if not exists "feedback_created_at" on mail.feedback ("created_at");
