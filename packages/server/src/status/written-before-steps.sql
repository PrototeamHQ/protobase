create schema if not exists "status";

create table "status"."statuses" (
  user_id text primary key references "auth"."user" (id) on delete cascade,
  availability text not null check (availability in ('automatic', 'busy', 'do_not_disturb')),
  text text check (char_length(text) between 1 and 100),
  clears_at timestamptz,
  updated_at timestamptz not null
);
