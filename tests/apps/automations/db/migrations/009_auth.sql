-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

-- 10 mail_sender_names: The display names of the From addresses people send mail from.
alter table "auth"."mail_sender" add column name text;

insert into "auth"."auth_migrations" (version, name) values (10, 'mail_sender_names');
