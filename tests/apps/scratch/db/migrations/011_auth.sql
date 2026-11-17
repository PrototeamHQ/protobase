-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

-- 12 user_indexes: The indexes that find the active admins and page through the users.
create index if not exists user_active_admin_idx on "auth"."user" (id) where "banned" is not true and 'admin' = any(regexp_split_to_array(regexp_replace(regexp_replace(coalesce("role", 'user'), '^\s*\{(.*)\}\s*$', '\1'), '^\s*"?|"?\s*$', '', 'g'), '"?\s*,\s*"?'));

create index if not exists user_created_at_id_idx on "auth"."user" ("created_at", id);

insert into "auth"."auth_migrations" (version, name) values (12, 'user_indexes');
