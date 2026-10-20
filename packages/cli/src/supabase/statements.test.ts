import { describe, expect, it } from 'vitest'
import { splitDump } from './statements'

const kinds = (script: string) => splitDump(script).map((piece) => [piece.kind, piece.text.trim()])

describe('splitDump', () => {
  it('splits statements, meta-commands and the gaps between them, keeping every character', () => {
    const script = "--\n-- dump\n--\n\n\\restrict abc\n\nSET a = 1;\n\nCREATE TABLE t (id int);\n\\unrestrict abc\n"
    expect(kinds(script)).toEqual([
      ['gap', '--\n-- dump\n--'],
      ['meta', '\\restrict abc'],
      ['gap', ''],
      ['statement', 'SET a = 1;'],
      ['gap', ''],
      ['statement', 'CREATE TABLE t (id int);'],
      ['gap', ''],
      ['meta', '\\unrestrict abc'],
    ])
    expect(splitDump(script).map((piece) => piece.text).join('')).toBe(script)
  })

  it('reads past a semicolon in strings, quoted names, comments and dollar quotes', () => {
    const script = [
      "COMMENT ON TABLE t IS 'a; b';",
      'CREATE TABLE "a;b" (id int);',
      "SELECT E'it\\'s; here';",
      'CREATE FUNCTION f() RETURNS int AS $body$ BEGIN; SELECT $$;$$; END $body$ LANGUAGE sql;',
      'SELECT 1 /* one; /* nested; */ */ + 1;',
      'SELECT 2 -- two;\n + 2;',
    ].join('\n')
    expect(splitDump(script).filter((piece) => piece.kind === 'statement')).toHaveLength(6)
  })

  it('keeps the data of a COPY from stdin with its statement', () => {
    const script = 'COPY public.t (a, b) FROM stdin;\n1\tx; y\n\\N\t\\\\.\n\\.\n\nCOPY public.e (a) FROM stdin;\n\\.\n'
    expect(kinds(script)).toEqual([
      ['statement', 'COPY public.t (a, b) FROM stdin;\n1\tx; y\n\\N\t\\\\.\n\\.'],
      ['gap', ''],
      ['statement', 'COPY public.e (a) FROM stdin;\n\\.'],
    ])
  })

  it('fails on a statement the dump never ends', () => {
    expect(() => splitDump("SELECT 'open;")).toThrow(/Unterminated/)
  })
})
