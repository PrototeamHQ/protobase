import { describe, expect, it } from 'vitest'
import { bareImport } from './specifier'

describe('bareImport', () => {
  it('turns npm: specifiers into bare imports of their package, with its range', () => {
    expect(bareImport('npm:zod@4')).toEqual({ specifier: 'zod', package: { name: 'zod', range: '4' } })
    expect(bareImport('npm:@supabase/server@^1')).toEqual({ specifier: '@supabase/server', package: { name: '@supabase/server', range: '^1' } })
    expect(bareImport('npm:hono@4.6.0/cors')).toEqual({ specifier: 'hono/cors', package: { name: 'hono', range: '4.6.0' } })
    expect(bareImport('npm:stripe')).toEqual({ specifier: 'stripe', package: { name: 'stripe', range: '*' } })
  })

  it("turns esm.sh URLs into bare imports, without esm.sh's own prefixes and query", () => {
    expect(bareImport('https://esm.sh/@supabase/supabase-js@2')).toEqual({ specifier: '@supabase/supabase-js', package: { name: '@supabase/supabase-js', range: '2' } })
    expect(bareImport('https://esm.sh/v135/preact@10.19.0/hooks?target=deno')).toEqual({ specifier: 'preact/hooks', package: { name: 'preact', range: '10.19.0' } })
    expect(bareImport('https://esm.sh/stable/*openai@4')).toEqual({ specifier: 'openai', package: { name: 'openai', range: '4' } })
    expect(bareImport('https://esm.sh/gh/user/repo/mod.ts')).toBeUndefined()
  })

  it("installs jsr: packages from jsr's npm registry", () => {
    expect(bareImport('jsr:@std/assert@^1/equals')).toEqual({ specifier: '@std/assert/equals', package: { name: '@std/assert', range: 'npm:@jsr/std__assert@^1' } })
  })

  it('leaves every other specifier alone', () => {
    expect(bareImport('https://deno.land/x/oak@v12.6.1/mod.ts')).toBeUndefined()
    expect(bareImport('./cors.ts')).toBeUndefined()
    expect(bareImport('node:crypto')).toBeUndefined()
  })
})
