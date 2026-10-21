import { describe, expect, it } from 'vitest'
import { isSupabaseRole, rewriteSchemaDump, type Missing } from './rewrite'

/** A database with no webhooks shim and no extension languages, as Postgres alone is. */
const plain: Missing = { triggerSchemas: ['supabase_functions'], languages: [] }

const rewrite = (statement: string, missing = plain) => rewriteSchemaDump(statement, missing, []).sql

describe('isSupabaseRole', () => {
  it("names Supabase's own roles and not the API's", () => {
    expect(['dashboard_user', 'supabase_admin', 'supabase_auth_admin', 'authenticator', 'postgres'].every(isSupabaseRole)).toBe(true)
    expect(['anon', 'authenticated', 'service_role', 'public', 'postgres_reader'].some(isSupabaseRole)).toBe(false)
  })
})

describe('rewriteSchemaDump', () => {
  it("leaves out grants that name only Supabase's roles, as comments", () => {
    expect(rewriteSchemaDump('GRANT ALL ON TABLE auth.users TO dashboard_user;\nGRANT SELECT ON TABLE auth.users TO postgres WITH GRANT OPTION;\n', plain, [])).toEqual({
      sql: "-- Left out by protobase import supabase: it names only Supabase's own roles.\n-- GRANT ALL ON TABLE auth.users TO dashboard_user;\n-- Left out by protobase import supabase: it names only Supabase's own roles.\n-- GRANT SELECT ON TABLE auth.users TO postgres WITH GRANT OPTION;\n",
      leftOut: 2,
    })
    expect(rewrite('REVOKE ALL ON FUNCTION auth.uid() FROM supabase_auth_admin;')).toMatch(/^-- Left out/)
  })

  it('keeps the grants to the API roles, without the Supabase roles beside them', () => {
    expect(rewrite('GRANT ALL ON TABLE public.todos TO anon;')).toBe('GRANT ALL ON TABLE public.todos TO anon;')
    expect(rewrite('GRANT SELECT ON TABLE public.todos TO postgres, anon, supabase_admin, authenticated;')).toBe('GRANT SELECT ON TABLE public.todos TO anon, authenticated;')
    expect(rewrite('REVOKE ALL ON FUNCTION public.f(a integer, b text) FROM PUBLIC;')).toBe('REVOKE ALL ON FUNCTION public.f(a integer, b text) FROM PUBLIC;')
  })

  it('reads the grantees, never a quoted name or string that looks like one', () => {
    expect(rewrite('GRANT SELECT ON TABLE public."to postgres" TO anon;')).toBe('GRANT SELECT ON TABLE public."to postgres" TO anon;')
    expect(rewrite('GRANT SELECT ON TABLE public.t TO "postgres";')).toMatch(/^-- Left out/)
  })

  it('makes default privileges the importing role\'s own, without those for Supabase\'s roles', () => {
    expect(rewrite('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;')).toBe('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon;')
    expect(rewrite('ALTER DEFAULT PRIVILEGES FOR ROLE postgres GRANT ALL ON SEQUENCES TO authenticated;')).toBe('ALTER DEFAULT PRIVILEGES GRANT ALL ON SEQUENCES TO authenticated;')
    expect(rewrite('ALTER DEFAULT PRIVILEGES FOR ROLE supabase_auth_admin IN SCHEMA auth GRANT ALL ON TABLES TO dashboard_user;')).toMatch(/^-- Left out/)
  })

  it('leaves out what concerns the public schema itself, publications and database webhooks', () => {
    for (const statement of [
      'CREATE SCHEMA public;',
      "COMMENT ON SCHEMA public IS 'standard public schema';",
      'ALTER SCHEMA public OWNER TO pg_database_owner;',
      'ALTER PUBLICATION supabase_realtime ADD TABLE ONLY public.todos;',
      "CREATE TRIGGER hook AFTER INSERT ON public.todos FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://example.com', 'POST', '{}', '{}', '1000');",
    ]) {
      expect(rewrite(statement)).toMatch(/^-- Left out by protobase import supabase: .*\.\n-- /)
    }
    expect(rewrite('CREATE SCHEMA billing;')).toBe('CREATE SCHEMA billing;')
    expect(rewrite('CREATE TRIGGER on_done AFTER UPDATE ON public.todos FOR EACH ROW EXECUTE FUNCTION public.notify_done();')).toMatch(/^CREATE TRIGGER/)
  })

  it('keeps database webhooks where the shim they call is made', () => {
    const hook = "CREATE TRIGGER hook AFTER INSERT ON public.todos FOR EACH ROW EXECUTE FUNCTION supabase_functions.http_request('https://example.com', 'POST', '{}', '{}', '1000');"
    expect(rewrite(hook, { triggerSchemas: [], languages: [] })).toBe(hook)
  })

  it("leaves out a hypertable's insert blocker, which timescaledb's own schema holds", () => {
    const blocker = 'CREATE TRIGGER ts_insert_blocker BEFORE INSERT ON public.metrics FOR EACH ROW EXECUTE FUNCTION _timescaledb_functions.insert_blocker();'
    expect(rewrite(blocker, { triggerSchemas: ['_timescaledb_functions'], languages: [] })).toMatch(/^-- Left out by protobase import supabase: it calls _timescaledb_functions\.insert_blocker, /)
  })

  it('leaves out functions in a missing language, with the statements and triggers naming them', () => {
    const dump = [
      'CREATE FUNCTION public.js_add(a integer, b integer) RETURNS integer\n    LANGUAGE plv8 IMMUTABLE\n    AS $$ return a + b $$;',
      "COMMENT ON FUNCTION public.js_add(a integer, b integer) IS 'adds';",
      'GRANT ALL ON FUNCTION public.js_add(a integer, b integer) TO anon;',
      'CREATE FUNCTION public.js_trigger() RETURNS trigger LANGUAGE plv8 AS $$ return NEW $$;',
      'CREATE TRIGGER on_insert BEFORE INSERT ON public.t FOR EACH ROW EXECUTE FUNCTION public.js_trigger();',
      'CREATE FUNCTION public.js_add(a text, b text) RETURNS text LANGUAGE sql AS $$ select a || b $$;',
      'GRANT ALL ON FUNCTION public.js_add(a text, b text) TO anon;',
      '',
    ].join('\n')
    const rewritten = rewriteSchemaDump(dump, { triggerSchemas: [], languages: ['plv8'] }, [])
    expect(rewritten.leftOut).toBe(5)
    expect(rewritten.sql).toContain("-- Left out by protobase import supabase: it is written in plv8, which the project's database does not have; the report lists it for conversion.")
    expect(rewritten.sql).toContain('\nCREATE FUNCTION public.js_add(a text, b text)')
    expect(rewritten.sql).toContain('\nGRANT ALL ON FUNCTION public.js_add(a text, b text) TO anon;')
    expect(rewrite(dump)).not.toContain('-- Left out')
  })

  it("leaves out pgsodium's labels, decrypted view and encrypting trigger, keeping the table and its ciphertext", () => {
    const dump = [
      'CREATE FUNCTION public."profiles_encrypt_secret_iban"() RETURNS trigger\n    LANGUAGE plpgsql\n    AS $$\n\t\tBEGIN\n\t\tnew.iban = CASE WHEN new.iban IS NULL THEN NULL ELSE encode(pgsodium.crypto_aead_det_encrypt(convert_to(new.iban, \'utf8\'), convert_to(\'\', \'utf8\'), new.key_id::uuid, NULL), \'base64\') END;\n\t\tRETURN new;\n\t\tEND;\n\t\t$$;',
      'CREATE TABLE public.profiles (\n    id bigint NOT NULL,\n    iban text,\n    key_id uuid\n);',
      "SECURITY LABEL FOR pgsodium ON COLUMN public.profiles.iban IS 'ENCRYPT WITH KEY COLUMN key_id';",
      'CREATE VIEW public.decrypted_profiles AS\n SELECT id,\n    iban,\n    CASE WHEN (iban IS NULL) THEN NULL::text ELSE convert_from(pgsodium.crypto_aead_det_decrypt(decode(iban, \'base64\'::text), convert_to(\'\'::text, \'utf8\'::name), key_id, NULL::bytea), \'utf8\'::name) END AS decrypted_iban\n   FROM public.profiles;',
      'GRANT SELECT ON TABLE public.decrypted_profiles TO authenticated;',
      'GRANT ALL ON FUNCTION public."profiles_encrypt_secret_iban"() TO anon;',
      'CREATE TRIGGER profiles_encrypt_secret_trigger_iban BEFORE INSERT OR UPDATE OF iban ON public.profiles FOR EACH ROW EXECUTE FUNCTION public."profiles_encrypt_secret_iban"();',
      'GRANT SELECT ON TABLE public.profiles TO authenticated;',
      '',
    ].join('\n')
    const rewritten = rewriteSchemaDump(dump, plain, [{ schema: 'public', table: 'profiles', column: 'iban' }])
    expect(rewritten.leftOut).toBe(6)
    expect(rewritten.sql).toContain('\nCREATE TABLE public.profiles (\n    id bigint NOT NULL,\n    iban text,\n    key_id uuid\n);\n')
    expect(rewritten.sql).toContain('\nGRANT SELECT ON TABLE public.profiles TO authenticated;\n')
    expect(rewritten.sql.split('\n').filter((line) => line.includes('pgsodium') || line.includes('encrypt_secret')).every((line) => line.startsWith('-- '))).toBe(true)
    expect(rewriteSchemaDump(dump, plain, []).sql).toMatch(/^CREATE FUNCTION public\."profiles_encrypt_secret_iban"\(\)/)
  })

  it('drops psql meta-commands and keeps everything else as it was', () => {
    const body = "CREATE FUNCTION public.f() RETURNS void LANGUAGE sql AS $$ GRANT ALL ON TABLE t TO postgres; $$;\n\n--\n-- comment\n--\n"
    expect(rewrite(`\\restrict key\n\n${body}\\unrestrict key\n`)).toBe(`\n${body}`)
  })
})
