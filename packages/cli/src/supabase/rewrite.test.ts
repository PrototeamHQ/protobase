import { describe, expect, it } from 'vitest'
import { isSupabaseRole, rewriteSchemaDump } from './rewrite'

const rewrite = (statement: string) => rewriteSchemaDump(statement).sql

describe('isSupabaseRole', () => {
  it("names Supabase's own roles and not the API's", () => {
    expect(['dashboard_user', 'supabase_admin', 'supabase_auth_admin', 'authenticator', 'postgres'].every(isSupabaseRole)).toBe(true)
    expect(['anon', 'authenticated', 'service_role', 'public', 'postgres_reader'].some(isSupabaseRole)).toBe(false)
  })
})

describe('rewriteSchemaDump', () => {
  it("leaves out grants that name only Supabase's roles, as comments", () => {
    expect(rewriteSchemaDump('GRANT ALL ON TABLE auth.users TO dashboard_user;\nGRANT SELECT ON TABLE auth.users TO postgres WITH GRANT OPTION;\n')).toEqual({
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

  it('drops psql meta-commands and keeps everything else as it was', () => {
    const body = "CREATE FUNCTION public.f() RETURNS void LANGUAGE sql AS $$ GRANT ALL ON TABLE t TO postgres; $$;\n\n--\n-- comment\n--\n"
    expect(rewrite(`\\restrict key\n\n${body}\\unrestrict key\n`)).toBe(`\n${body}`)
  })
})
