import { describe, expect, it } from 'vitest'
import { convertSource, type SourceOptions } from './convert-source'

const entry: SourceOptions = { file: 'functions/hello/index.ts', entry: true, public: false, importMap: {} }

const convert = (code: string, options: Partial<SourceOptions> = {}) => convertSource(code, { ...entry, ...options })

describe('convertSource', () => {
  it("makes Deno.serve's handler the default export's fetch, with or without options", () => {
    expect(convert('Deno.serve((req) => new Response("hi"))\n').code).toBe('export default { fetch: (req) => new Response("hi") }\n')
    expect(convert('Deno.serve({ port: 8000 }, handler)\n').code).toBe('export default { fetch: handler }\n')
  })

  it("drops std's serve import and serves its handler, under any local name", () => {
    const code = "// hello\nimport { serve as listen } from 'https://deno.land/std@0.168.0/http/server.ts'\n\nlisten(async () => new Response('hi'))\n"
    expect(convert(code)).toEqual({ code: "// hello\n\nexport default { fetch: async () => new Response('hi') }\n", packages: [], left: [] })
  })

  it('opens a public function with defineFunction, whether it served or default-exported', () => {
    expect(convert('Deno.serve(handler)\n', { public: true }).code).toBe("import { defineFunction } from '@protobase/server'\nexport default defineFunction({ public: true }, { fetch: handler })\n")
    expect(convert('export default { fetch: handler }\n', { public: true }).code).toBe("import { defineFunction } from '@protobase/server'\nexport default defineFunction({ public: true }, { fetch: handler })\n")
  })

  it('reads Deno.env.get from process.env and maps EdgeRuntime.waitUntil to Protobase’s', () => {
    const code = "const key = Deno.env.get('KEY')!\nexport default { fetch: () => { EdgeRuntime.waitUntil(send(key)); return new Response() } }\n"
    expect(convert(code).code).toBe("import { waitUntil } from '@protobase/server'\nconst key = process.env['KEY']!\nexport default { fetch: () => { waitUntil(send(key)); return new Response() } }\n")
  })

  it("rewrites npm:, jsr: and esm.sh imports, import-mapped ones too, and drops Supabase's runtime types", () => {
    const code = [
      "import 'jsr:@supabase/functions-js/edge-runtime.d.ts'",
      "import { createClient } from 'supabase'",
      "export { assert } from 'jsr:@std/assert@1'",
      "const { z } = await import('https://esm.sh/zod@3.23.8')",
      "import { cors } from '../_shared/cors.ts'",
      'export default { fetch: () => new Response() }',
      '',
    ].join('\n')
    expect(convert(code, { importMap: { supabase: 'npm:@supabase/supabase-js@2' } })).toEqual({
      code: [
        "import { createClient } from '@supabase/supabase-js'",
        "export { assert } from '@std/assert'",
        "const { z } = await import('zod')",
        "import { cors } from '../_shared/cors.ts'",
        'export default { fetch: () => new Response() }',
        '',
      ].join('\n'),
      packages: [
        { name: '@supabase/supabase-js', range: '2' },
        { name: '@std/assert', range: 'npm:@jsr/std__assert@1' },
        { name: 'zod', range: '3.23.8' },
      ],
      left: [],
    })
  })

  it("leaves Deno's and Supabase's other APIs and imports of no npm package, and says where", () => {
    const code = [
      "import { Application } from 'https://deno.land/x/oak@v12.6.1/mod.ts'",
      'Deno.serve(async (req) => {',
      "  const note = await Deno.readTextFile('./note.txt')",
      '  const kv = await Deno.openKv()',
      "  const session = new Supabase.ai.Session('gte-small')",
      '  return new Response(Deno.env.toObject().HOME)',
      '})',
      '',
    ].join('\n')
    expect(convert(code).left).toEqual([
      'functions/hello/index.ts:1: import of https://deno.land/x/oak@v12.6.1/mod.ts, which is no npm package: import one that does the same',
      'functions/hello/index.ts:3: Deno.readTextFile, of Deno: rewrite it for Node or Bun',
      'functions/hello/index.ts:4: Deno.openKv, of Deno: rewrite it for Node or Bun',
      "functions/hello/index.ts:5: Supabase.ai.Session, of Supabase's runtime: rewrite it for Node or Bun",
      'functions/hello/index.ts:6: Deno.env.toObject, of Deno: rewrite it for Node or Bun',
    ])
  })

  it('serves only from an entry, once, and says when an entry serves nothing', () => {
    expect(convert('Deno.serve(handler)\n', { entry: false }).left).toEqual(['functions/hello/index.ts:1: Deno.serve(...), which Protobase does not run: default-export { fetch: handler }'])
    expect(convert('export default app\nDeno.serve(handler)\n').left).toEqual(['functions/hello/index.ts:2: Deno.serve(...), which Protobase does not run: default-export { fetch: handler }'])
    expect(convert('const x = 1\n').left).toEqual(['functions/hello/index.ts:1: no Deno.serve or default export to serve'])
  })
})
