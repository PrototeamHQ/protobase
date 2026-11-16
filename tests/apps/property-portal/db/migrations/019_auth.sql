-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

-- 11 user_indexes: The indexes that find the active admins and page through the users.
create index if not exists user_active_admin_idx on "auth"."user" (id) where "banned" is not true and 'admin' = any(string_to_array(replace(btrim(coalesce("role", 'user'), '{}'), ' ', ''), ','));

create index if not exists user_created_at_id_idx on "auth"."user" ("created_at", id);

insert into "auth"."auth_migrations" (version, name) values (11, 'user_indexes');
