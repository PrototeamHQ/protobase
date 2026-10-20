import { describe, expect, it } from 'vitest'
import { loadScript } from './load-script'

describe('loadScript', () => {
  it("turns the app's triggers off around the data, then counts every table against the source", () => {
    expect(loadScript("/app/supabase-import/it's data.sql", [{ schema: 'auth', table: 'users', rows: 2 }, { schema: 'public', table: 'odd"name', rows: 0 }])).toBe(
      [
        'ALTER TABLE "auth"."users" DISABLE TRIGGER USER;',
        'ALTER TABLE "public"."odd""name" DISABLE TRIGGER USER;',
        "\\i '/app/supabase-import/it''s data.sql'",
        'ALTER TABLE "auth"."users" ENABLE TRIGGER USER;',
        'ALTER TABLE "public"."odd""name" ENABLE TRIGGER USER;',
        `DO $$ DECLARE found bigint; BEGIN SELECT count(*) INTO found FROM "auth"."users"; IF found <> 2 THEN RAISE EXCEPTION 'table %.% has % rows after the load, the source had 2', 'auth', 'users', found; END IF; END $$;`,
        `DO $$ DECLARE found bigint; BEGIN SELECT count(*) INTO found FROM "public"."odd""name"; IF found <> 0 THEN RAISE EXCEPTION 'table %.% has % rows after the load, the source had 0', 'public', 'odd"name', found; END IF; END $$;`,
        '',
      ].join('\n'),
    )
  })
})
