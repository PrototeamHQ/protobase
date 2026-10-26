-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

alter table "auth"."user" add column if not exists "email_confirmed_at" timestamptz;
