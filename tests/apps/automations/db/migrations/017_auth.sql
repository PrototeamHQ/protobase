-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

-- 14 user_name_search: The indexes that find the users by a part of their name and list them by name.
create extension if not exists pg_trgm;

create index if not exists user_name_id_idx on "auth"."user" ("name", id);

create index if not exists user_name_trgm_idx on "auth"."user" using gin ("name" gin_trgm_ops);

insert into "auth"."auth_migrations" (version, name) values (14, 'user_name_search');
