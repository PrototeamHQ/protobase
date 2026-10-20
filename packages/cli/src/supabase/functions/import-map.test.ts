import { describe, expect, it } from 'vitest'
import { readImportMap, resolveImport } from './import-map'

describe('readImportMap', () => {
  it("reads a deno.jsonc's imports, comments and all", () => {
    expect(readImportMap('deno.jsonc', '{\n  // the client\n  "imports": { "supabase": "npm:@supabase/supabase-js@2" },\n}')).toEqual({ supabase: 'npm:@supabase/supabase-js@2' })
    expect(readImportMap('deno.json', '{ "tasks": {} }')).toEqual({})
  })
})

describe('resolveImport', () => {
  it('resolves an exact entry, then the longest prefix, and leaves anything else alone', () => {
    const map = { zod: 'npm:zod@4', 'std/': 'https://deno.land/std@0.168.0/', 'std/http/': 'https://deno.land/std@0.177.0/http/' }
    expect(resolveImport('zod', map)).toBe('npm:zod@4')
    expect(resolveImport('std/http/server.ts', map)).toBe('https://deno.land/std@0.177.0/http/server.ts')
    expect(resolveImport('./cors.ts', map)).toBe('./cors.ts')
  })
})
