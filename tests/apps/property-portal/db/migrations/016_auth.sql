-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

-- 8 personal_access_tokens: The personal access tokens people make for their scripts, by their tokens' hashes.
create table "auth"."personal_access_token" (
  id text primary key,
  user_id text not null references "auth"."user" (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  role text not null,
  organization_id text references "auth"."organization" (id) on delete cascade,
  created_at timestamptz not null,
  expires_at timestamptz,
  last_used_at timestamptz
);

create index personal_access_token_user_id_idx on "auth"."personal_access_token" (user_id);

insert into "auth"."auth_migrations" (version, name) values (8, 'personal_access_tokens');
