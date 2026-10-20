import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { planFunctions } from './plan-functions'

let projectDir: string

const put = async (file: string, text: string) => {
  await mkdir(path.dirname(path.join(projectDir, file)), { recursive: true })
  await writeFile(path.join(projectDir, file), text)
}

beforeEach(async () => {
  projectDir = await mkdtemp(path.join(tmpdir(), 'protobase-functions-'))
})

afterEach(() => rm(projectDir, { recursive: true, force: true }))

describe('planFunctions', () => {
  it('converts every function and shared folder, with the import maps, and copies their other files', async () => {
    await put('supabase/functions/import_map.json', '{ "imports": { "zod": "npm:zod@4" } }')
    await put('supabase/functions/_shared/cors.ts', "export const origin = Deno.env.get('ORIGIN')\n")
    await put('supabase/functions/hello/index.ts', "import { z } from 'zod'\nimport { origin } from '../_shared/cors.ts'\nDeno.serve(() => Response.json({ origin }))\n")
    await put('supabase/functions/hello/deno.json', '{ "imports": { "zod": "npm:zod@3" } }')
    await put('supabase/functions/hello/templates/mail.html', '<p>hi</p>')
    await put('supabase/functions/webhook/index.ts', "import { z } from 'npm:zod@4'\nexport default { fetch: () => new Response() }\n")
    await put('supabase/functions/broken/main.ts', 'Deno.serve(() => new Response())\n')
    await put('supabase/config.toml', '[functions.webhook]\nverify_jwt = false\n')

    const plan = await planFunctions(projectDir)
    expect(plan.files.map((file) => file.path)).toEqual(['functions/_shared/cors.ts', 'functions/hello/index.ts', 'functions/hello/templates/mail.html', 'functions/webhook/index.ts'])
    expect(plan.files[0]!.content).toBe("export const origin = process.env['ORIGIN']\n")
    expect(plan.functions).toEqual([{ name: 'hello', public: false }, { name: 'webhook', public: true }])
    expect(plan.packages).toEqual([{ name: 'zod', range: '3' }])
    expect(plan.left).toEqual([
      'supabase/functions/broken has no index.ts, so it was not imported: move its entry point there',
      'functions/webhook/index.ts asks for zod 4, another file for 3; package.json has 3',
    ])
  })

  it("has nothing to do without supabase/functions, and refuses to overwrite the project's functions", async () => {
    expect(await planFunctions(projectDir)).toEqual({ files: [], functions: [], packages: [], left: [] })
    await put('supabase/functions/hello/index.ts', 'export default { fetch: () => new Response() }\n')
    await put('functions/hello.ts', 'export default () => new Response()\n')
    await expect(planFunctions(projectDir)).rejects.toThrow("The project's functions/ already has hello; move them aside to import supabase/functions")
  })
})
