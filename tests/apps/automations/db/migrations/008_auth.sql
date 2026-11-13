-- The auth schema changes this version of Protobase needs, written by `protobase auth migration`.
-- Applied with the project's other migrations; edit or remove statements the project handles differently.

-- 9 mail_senders: The From addresses people send mail from through the mailbox they linked.
create table "auth"."mail_sender" (
  id text primary key,
  user_id text not null references "auth"."user" (id) on delete cascade,
  address text not null,
  shared boolean not null,
  signature text,
  is_default boolean not null,
  created_at timestamptz not null,
  unique (user_id, address)
);

create unique index mail_sender_default_idx on "auth"."mail_sender" (user_id) where is_default;

create index mail_sender_shared_idx on "auth"."mail_sender" (address) where shared;

insert into "auth"."auth_migrations" (version, name) values (9, 'mail_senders');
