-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

-- mail_senders 5 sender_sharing: When the owner of each From address shared it with the app's other senders.
alter table "auth"."mail_sender" add column "shared_at" timestamptz;

alter table "auth"."mail_sender" alter column "shared" drop not null;

create index "mail_sender_shared_at_idx" on "auth"."mail_sender" ("user_id") where "shared_at" is not null;

insert into "auth"."auth_migrations" ("version", "name") values (17, 'sender_sharing');
