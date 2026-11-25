create schema if not exists "mail";

create table if not exists mail.unsubscribes (
  "id" bigint generated always as identity primary key,
  "recipient" text not null check ("recipient" = lower("recipient")),
  "topic" text not null,
  "created_at" timestamptz not null
);

create unique index if not exists "unsubscribes_recipient_topic" on mail.unsubscribes ("recipient", "topic");
create index if not exists "unsubscribes_topic" on mail.unsubscribes ("topic");
create index if not exists "unsubscribes_created_at" on mail.unsubscribes ("created_at");
