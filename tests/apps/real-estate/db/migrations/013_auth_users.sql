-- Everyone who signs in is one of the example's users: their Better Auth id is the next core.users id
-- (`generateUserId` in auth/auth.ts), which tickets name as their assignee, and their row there, in organization 1
-- where everyone works, comes with their account. The roles they hold in the app live in the auth schema, so the
-- example's own role column stays empty for them.
alter table core.users alter column role drop not null;

create function core.add_auth_user() returns trigger language plpgsql as $$
begin
  insert into core.users (id, organization_id, email, name)
  select new.id::integer, 1, new.email, new.name
  where new.id ~ '^[0-9]+$'
  on conflict do nothing;
  return new;
end
$$;

create trigger auth_user after insert on auth."user" for each row execute function core.add_auth_user();
