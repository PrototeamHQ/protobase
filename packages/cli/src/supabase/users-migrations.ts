import { accountIdSql, accountProviderSql, carriesAccountSql, confirmedOwnerSql } from './identity-providers'

// On the copy of a Supabase database `protobase import supabase` makes, Better Auth signs in on auth.users itself, so
// every foreign key, trigger and policy naming it keeps working. Its planner cannot add a required column to a table
// with rows, so the import writes two migrations of its own around the one `protobase auth migration` writes: the
// columns first, nullable, and after it what fills them and makes each user's accounts. `create protobase`, on a
// Supabase database it shares with Supabase Auth, writes `sharedUsersMigration` instead.

/** The user columns Better Auth needs that GoTrue's auth.users lacks, empty for now. */
export const usersColumnsMigration = () => `-- The columns Better Auth needs on Supabase's auth.users, written by \`protobase import supabase\`.
-- Empty until the import's accounts migration fills them from what Supabase recorded; NULL where it recorded nothing.
alter table auth.users
  add column name text,
  add column email_verified boolean,
  add column image text,
  add column app_role text,
  add column banned boolean,
  add column ban_reason text,
  add column ban_expires timestamptz;

-- The value GoTrue writes into every user it makes, for the triggers and policies that read it on new sign-ups.
alter table auth.users alter column role set default 'authenticated', alter column aud set default 'authenticated';
`

/** Once auth.users has its rows and Better Auth's tables are planned: the users' columns and accounts. */
export const accountsMigration = () => `-- Supabase's users signing in with Better Auth, written by \`protobase import supabase\` once their rows were loaded.

-- The user columns, from what Supabase Auth recorded. A ban lasts until banned_until, as on Supabase: Better Auth lifts
-- it once ban_expires has passed.
update auth.users set
  name = coalesce(raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'),
  email_verified = email_confirmed_at is not null,
  image = coalesce(raw_user_meta_data->>'avatar_url', raw_user_meta_data->>'picture'),
  banned = case when banned_until is not null then true end,
  ban_expires = banned_until;

-- Each password, as Supabase hashed it: Better Auth verifies the bcrypt hash and stores it again as its own on sign-in.
-- Only for confirmed addresses: GoTrue refuses a password sign-in to an unconfirmed one and Better Auth would not, so
-- whoever signed up with someone else's address could sign in as them. Those users sign in by code or reset a password.
insert into auth.account (account_id, provider_id, user_id, password, created_at, updated_at)
select id::text, 'credential', id, encrypted_password, coalesce(created_at, now()), coalesce(updated_at, now())
from auth.users where encrypted_password is not null and encrypted_password <> '' and email_confirmed_at is not null;

-- Each identity of a social provider, by Better Auth's name for it and the claim it keys the account on. Sessions and
-- provider tokens stay behind: everyone signs in once. Only for users with a confirmed address or none, for the reason
-- above: GoTrue refuses a provider sign-in to an unconfirmed one too, though it keeps the identity.
insert into auth.account (account_id, provider_id, user_id, created_at, updated_at)
select account_id, provider_id, user_id, created_at, updated_at from (
  select ${accountIdSql} as account_id, ${accountProviderSql} as provider_id, user_id, coalesce(created_at, now()) as created_at, coalesce(updated_at, now()) as updated_at
  from auth.identities where ${carriesAccountSql} and ${confirmedOwnerSql}
) identity where account_id is not null;
`
