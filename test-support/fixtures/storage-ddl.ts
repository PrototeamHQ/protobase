/** The users of the `/storage/v1` tests' database, by name. */
export const storageUsers = {
  alice: '2b2b2b2b-0000-0000-0000-000000000001',
  bob: '2b2b2b2b-0000-0000-0000-000000000002',
} as const

// The `/storage/v1` tests' database, laid out as `protobase import supabase` restores a Supabase project: the `anon`,
// `authenticated` and `service_role` roles, Supabase's `auth.uid()`, and the `storage` schema of Storage v1.84 with the
// columns, indexes, triggers and grants `/storage/v1` meets, two buckets and their policies. The roles belong to the
// server, so a second template finds them there.
export const storageDdl = `
do $$ begin create role anon nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;

create schema auth;
create function auth.uid() returns uuid language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid
$f$;
grant usage on schema auth to anon, authenticated, service_role;

create schema storage;
create function storage.foldername(name text) returns text[] language plpgsql immutable as $f$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end
$f$;
create function storage.protect_delete() returns trigger language plpgsql as $f$
begin
  if coalesce(current_setting('storage.allow_delete_query', true), 'false') != 'true' then
    raise exception 'Direct deletion from storage tables is not allowed. Use the Storage API instead.' using errcode = '42501';
  end if;
  return null;
end
$f$;
create function storage.update_updated_at_column() returns trigger language plpgsql as $f$
begin
  new.updated_at = now();
  return new;
end
$f$;

create table storage.buckets (
  id text primary key,
  name text not null,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  public boolean default false,
  avif_autodetection boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner_id text
);
create unique index bname on storage.buckets using btree (name);

create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text,
  owner uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata jsonb,
  path_tokens text[] generated always as (string_to_array(name, '/')) stored,
  version text,
  owner_id text,
  user_metadata jsonb
);
create unique index bucketid_objname on storage.objects using btree (bucket_id, name);
create index idx_objects_bucket_id_name on storage.objects using btree (bucket_id, name collate "C");
create index name_prefix_search on storage.objects using btree (name text_pattern_ops);
create trigger protect_buckets_delete before delete on storage.buckets for each statement execute function storage.protect_delete();
create trigger protect_objects_delete before delete on storage.objects for each statement execute function storage.protect_delete();
create trigger update_objects_updated_at before update on storage.objects for each row execute function storage.update_updated_at_column();

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to service_role;
grant select, insert, update, delete on storage.buckets, storage.objects to anon, authenticated;
alter table storage.buckets enable row level security;
alter table storage.objects enable row level security;

insert into storage.buckets (id, name, public, created_at, updated_at) values
  ('avatars', 'avatars', true, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
  ('documents', 'documents', false, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
update storage.buckets set allowed_mime_types = '{image/*}', file_size_limit = 1000 where id = 'avatars';

create policy "Avatar images are publicly accessible" on storage.objects for select using (bucket_id = 'avatars');
create policy "Users upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users keep their own documents" on storage.objects for all to authenticated
  using (bucket_id = 'documents' and owner_id = (select auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Buckets are listed to users" on storage.buckets for select to authenticated using (true);
`
