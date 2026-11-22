-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

-- mail_senders 3 mail_sender_checks: Which From addresses a check proved, and through which mailbox.
alter table "auth"."mail_sender" add column "verified_at" timestamptz;

alter table "auth"."mail_sender" add column "verified_account_id" text references "auth"."account" (id) on delete set null;

alter table "auth"."mail_sender" add column "check_token" text;

alter table "auth"."mail_sender" add column "check_account_id" text references "auth"."account" (id) on delete set null;

insert into "auth"."auth_migrations" ("version", "name") values (15, 'mail_sender_checks');
