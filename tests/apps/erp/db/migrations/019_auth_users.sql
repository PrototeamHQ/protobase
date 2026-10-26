-- Everyone who signs in is one of the ERP's users: their Better Auth id is the next core.users id (`generateUserId` in
-- auth/auth.ts), which records name as their owner, and their row there comes with their first membership, in that
-- organization, whichever way they join. The roles they hold in the app live in the auth schema, so the ERP's own
-- role column stays empty for them.
alter table core.users alter column role drop not null;

create function core.add_member_user() returns trigger language plpgsql as $$
begin
  insert into core.users (id, organization_id, email, name)
  select u.id::integer, new.organization_id::integer, u.email, u.name
  from auth."user" u
  where u.id = new.user_id and u.id ~ '^[0-9]+$'
  on conflict do nothing;
  return new;
end
$$;

create trigger member_user after insert on auth.member for each row execute function core.add_member_user();
