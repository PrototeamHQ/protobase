-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

-- 13 lookup_indexes: The indexes that page through the organizations and find passkeys, staff sign-ins and app invitations.
create index organization_created_at_id_idx on "auth"."organization" (created_at, id);

create index passkey_rp_id_idx on "auth"."passkey" (rp_id);

create index staff_sign_in_session_id_idx on "auth"."staff_sign_in" (session_id);

create index staff_sign_in_started_at_idx on "auth"."staff_sign_in" (started_at desc);

create index verification_identifier_pattern_idx on "auth"."verification" (identifier text_pattern_ops);

insert into "auth"."auth_migrations" (version, name) values (13, 'lookup_indexes');
