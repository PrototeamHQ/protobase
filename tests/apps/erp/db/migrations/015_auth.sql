-- The auth schema changes this version of Protobase needs, written by `protobase migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

alter table "auth"."passkey" add column if not exists "rp_id" text;
