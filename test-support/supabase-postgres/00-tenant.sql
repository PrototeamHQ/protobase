-- Supabase's Postgres image initialised as a dedicated Protobase Cloud instance is, instead of by Supabase's own init:
-- the bootstrap superuser supabase_admin, a tenant named postgres that is no superuser, and the API roles it may switch
-- to. supautils, which the image preloads, lets the tenant create the extensions Supabase allows.
create role postgres login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls password 'protobase';
create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;
grant anon, authenticated, service_role to postgres with inherit false, set true;
