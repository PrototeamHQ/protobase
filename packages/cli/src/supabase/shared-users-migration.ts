import { sharedUsersSchema as schema } from './auth-config'
import { accountIdSql, accountProviderSql, carriesAccountSql } from './identity-providers'

// On a Supabase database the app shares with Supabase Auth, which alone may change its `auth` schema, Better Auth's
// user model is a view over auth.users joined to a table of the columns only Better Auth has, and its writes go through
// the view's trigger: Supabase's columns to auth.users, which the database's `postgres` may write, the rest to the side
// table. `create protobase` writes it after the auth store's migration, which points every foreign key at auth.users.

// The users Better Auth can sign in: it needs an email, so phone-only and anonymous users are left out, as are the
// users Supabase deleted softly.
const signsIn = (u: string) => `${u}.email is not null and ${u}.email <> '' and ${u}.deleted_at is null and not coalesce(${u}.is_anonymous, false)`

const viewSql = `-- Each user as Better Auth reads them. The name and picture are read from Supabase's user metadata, where a change made
-- in Supabase shows at once. A ban is the app's own, in the side table, or Supabase's while it lasts: lifting the app's
-- never lifts Supabase's. No password, token or app metadata of auth.users is in it.
create view ${schema}.users with (security_invoker = on) as
select u.id,
  coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name') as name,
  u.email::text as email,
  u.email_confirmed_at is not null as email_verified,
  u.email_confirmed_at,
  coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture') as image,
  u.created_at,
  u.updated_at,
  x.app_role,
  case when x.banned then true when u.banned_until > now() then true end as banned,
  case when x.banned then x.ban_reason end as ban_reason,
  case when x.banned then x.ban_expires when u.banned_until > now() then u.banned_until end as ban_expires,
  x.last_role,
  x.two_factor_enabled,
  x.last_organization_id,
  u.raw_user_meta_data
from auth.users u left join ${schema}.user_extra x on x.id = u.id
where ${signsIn('u')};`

// A side column takes a write only when the write changes it, so a value the view reads from Supabase, such as its
// ban, is never copied into the side table.
const sideTypes = { app_role: 'text', banned: 'boolean', ban_reason: 'text', ban_expires: 'timestamptz', last_role: 'text', two_factor_enabled: 'boolean', last_organization_id: 'text' }
const sideColumns = Object.keys(sideTypes)
const changedSide = sideColumns.map((column) => `${column} = case when new.${column} is distinct from old.${column} then new.${column} else x.${column} end`).join(',\n      ')

const triggerSql = `-- Writes through the view. A user the app creates gets a row in auth.users as Supabase Auth makes one, with '' in the
-- token columns it reads as text, and Supabase's own role, audience and app metadata; an id or email auth.users has
-- already fails on its constraints. An update writes only what it changes: the metadata keys it changes are merged into
-- the row's current metadata, so a change Supabase makes meanwhile to another key stays. Deleting a user deletes them
-- from auth.users, and with them their accounts, sessions and side row.
create function ${schema}.users_write() returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  patch jsonb := '{}';
begin
  if tg_op = 'DELETE' then
    delete from auth.users where id = old.id;
    return old;
  end if;
  if tg_op = 'INSERT' then
    new.id := coalesce(new.id, gen_random_uuid());
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := coalesce(new.updated_at, now());
    insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', new.id, 'authenticated', 'authenticated', new.email,
      case when new.email_verified then coalesce(new.email_confirmed_at, now()) end, new.created_at, new.updated_at,
      '{"provider":"email","providers":["email"]}',
      coalesce(new.raw_user_meta_data, '{}') || jsonb_strip_nulls(jsonb_build_object('full_name', new.name, 'avatar_url', new.image)),
      '', '', '', '');
    insert into ${schema}.user_extra (id, ${sideColumns.join(', ')})
    values (new.id, ${sideColumns.map((column) => `new.${column}`).join(', ')});
    return new;
  end if;
  if new.raw_user_meta_data is distinct from old.raw_user_meta_data then
    select coalesce(jsonb_object_agg(key, value), '{}') into patch from jsonb_each(coalesce(new.raw_user_meta_data, '{}'))
    where old.raw_user_meta_data -> key is distinct from value;
  end if;
  if new.name is distinct from old.name then patch := patch || jsonb_build_object('full_name', new.name); end if;
  if new.image is distinct from old.image then patch := patch || jsonb_build_object('avatar_url', new.image); end if;
  update auth.users u set
    email = case when new.email is distinct from old.email then new.email else u.email end,
    email_confirmed_at = case
      when new.email_verified is not distinct from old.email_verified and new.email_confirmed_at is not distinct from old.email_confirmed_at then u.email_confirmed_at
      when new.email_verified then coalesce(new.email_confirmed_at, u.email_confirmed_at, now())
    end,
    raw_user_meta_data = coalesce(u.raw_user_meta_data, '{}') || patch,
    updated_at = coalesce(new.updated_at, now())
  where u.id = old.id;
  insert into ${schema}.user_extra (id) values (old.id) on conflict (id) do nothing;
  update ${schema}.user_extra x set
      ${changedSide}
  where x.id = old.id;
  return new;
end $$;

create trigger users_write instead of insert or update or delete on ${schema}.users for each row execute function ${schema}.users_write();`

/** The side table, the view over auth.users and its trigger, then the users' accounts, as `create protobase` writes them. */
export const sharedUsersMigration = () => `-- Supabase's users signing in with Better Auth, written by \`create protobase\`: nothing in Supabase's auth schema changes.

-- The columns only Better Auth has, for each user of auth.users that has any.
create table ${schema}.user_extra (
  id uuid primary key references auth.users (id) on delete cascade,
  ${Object.entries(sideTypes).map(([column, type]) => `${column} ${type}`).join(',\n  ')}
);

${viewSql}

${triggerSql}

-- Each password, as Supabase hashed it: Better Auth verifies the bcrypt hash and stores it again as its own on sign-in.
-- Only for confirmed addresses: Supabase Auth refuses a password sign-in to an unconfirmed one and Better Auth would
-- not, so whoever signed up with someone else's address could sign in as them. Users who sign up through Supabase Auth
-- later have no password in the app.
insert into ${schema}.account (account_id, provider_id, user_id, password, created_at, updated_at)
select id::text, 'credential', id, encrypted_password, coalesce(created_at, now()), coalesce(updated_at, now())
from auth.users where encrypted_password is not null and encrypted_password <> '' and email_confirmed_at is not null and ${signsIn('auth.users')};

-- Each identity of a social provider, by Better Auth's name for it and the claim it keys the account on, for the users
-- the view holds with a confirmed address, for the reason above.
insert into ${schema}.account (account_id, provider_id, user_id, created_at, updated_at)
select account_id, provider_id, user_id, created_at, updated_at from (
  select ${accountIdSql} as account_id, ${accountProviderSql} as provider_id, user_id, coalesce(created_at, now()) as created_at, coalesce(updated_at, now()) as updated_at
  from auth.identities where ${carriesAccountSql}
    and user_id in (select id from auth.users where email_confirmed_at is not null and ${signsIn('auth.users')})
) identity where account_id is not null;
`
