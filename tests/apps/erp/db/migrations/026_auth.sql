-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

-- 11 account_keys: One account per provider and account id, and the device accounts people signed out of.
create unique index account_provider_id_account_id_uidx on "auth"."account" (provider_id, account_id);
create table "auth"."refused_account" (
  id text primary key,
  provider_id text not null,
  account_id text not null,
  user_id text not null references "auth"."user" (id) on delete cascade,
  created_at timestamptz not null,
  unique (provider_id, account_id)
);
create index refused_account_user_id_idx on "auth"."refused_account" (user_id);

insert into "auth"."auth_migrations" (version, name) values (11, 'account_keys');
