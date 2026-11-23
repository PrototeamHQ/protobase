-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

-- mail_senders 4 sender_verifications: The verifications the app's verifiers run on From addresses.
create table "auth"."mail_sender_verification" (
  id text primary key,
  "sender_id" text not null references "auth"."mail_sender" (id) on delete cascade,
  "verifier" text not null,
  "state" text not null check ("state" in ('pending', 'verified', 'failed')),
  "secret_hash" text not null,
  "created_at" timestamptz not null,
  "expires_at" timestamptz not null,
  "next_check_at" timestamptz not null,
  "settled_at" timestamptz,
  "valid_until" timestamptz,
  "error_code" text,
  "error" text check (char_length("error") <= 500)
);

create unique index "mail_sender_verification_pending_uidx" on "auth"."mail_sender_verification" ("sender_id", "verifier") where "state" = 'pending';

create unique index "mail_sender_verification_secret_uidx" on "auth"."mail_sender_verification" ("secret_hash");

create index "mail_sender_verification_due_idx" on "auth"."mail_sender_verification" ("next_check_at") where "state" = 'pending';

create index "mail_sender_verification_expiry_idx" on "auth"."mail_sender_verification" ("expires_at") where "state" = 'pending';

create index "mail_sender_verification_sender_idx" on "auth"."mail_sender_verification" ("sender_id", "verifier", "created_at");

insert into "auth"."auth_migrations" ("version", "name") values (16, 'sender_verifications');
