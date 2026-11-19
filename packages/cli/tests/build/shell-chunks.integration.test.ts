import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildShell, readShell } from '../../src/build/shell'
import { pinnedNative } from '../../src/mobile/pinned-packages'

type Chunk = { file: string; imports: string[] }

// The shell's scripts, each with the scripts it imports statically.
const readChunks = async (assets: string) => {
  const chunks = new Map<string, Chunk>()
  for (const file of (await readdir(assets)).filter((name) => name.endsWith('.js'))) {
    const code = await readFile(path.join(assets, file), 'utf8')
    const imports = [...code.matchAll(/\b(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)].map((match) => match[1]!)
    chunks.set(file, { file, imports })
  }
  return chunks
}

// The scripts that load with `roots` and all they import statically.
const loadedWith = (roots: string[], chunks: Map<string, Chunk>) => {
  const loaded = new Set<string>()
  const visit = (file: string) => {
    if (loaded.has(file)) return
    loaded.add(file)
    for (const imported of chunks.get(file)?.imports ?? []) visit(imported)
  }
  for (const root of roots) visit(root)
  return loaded
}

const named = (file: string, name: string) => file.startsWith(`${name}-`)
const thirdParty = (file: string) => named(file, 'react') || named(file, 'vendor') || named(file, 'lib') || named(file, 'rolldown-runtime')

describe('the built shell’s chunk graph', () => {
  let dir: string
  let chunks: Map<string, Chunk>
  // What index.html's script loads before the app draws, and what @protobase/ui's entry adds for an app with plugins
  let start: Set<string>
  let withPlugins: Set<string>

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-shell-chunks-'))
    await buildShell(dir)
    chunks = await readChunks(path.join(dir, 'assets'))
    const html = await readFile(path.join(dir, 'index.html'), 'utf8')
    start = loadedWith([...html.matchAll(/<script type="module"[^>]*src="\/assets\/([^"]+\.js)"/g)].map((match) => match[1]!), chunks)
    const sharedUi = /"@protobase\/ui":"\/assets\/([^"]+\.js)"/.exec(html)![1]!
    withPlugins = loadedWith([...start, sharedUi], chunks)
  }, 120_000)

  afterAll(() => rm(dir, { recursive: true, force: true }))

  it('starts from a few chunks: react, vendor and the app’s own, which react and vendor do not import', () => {
    expect([...start].map((file) => file.split('-')[0]).sort()).toEqual(['app', 'index', 'react', 'rolldown', 'vendor'])
    for (const file of start) if (named(file, 'react') || named(file, 'vendor')) expect(chunks.get(file)!.imports.filter((imported) => !thirdParty(imported))).toEqual([])
  })

  it('adds no chunk but its own entry for the plugins’ @protobase/ui', () => {
    const added = [...withPlugins].filter((file) => !start.has(file))
    expect(added).toHaveLength(1)
    expect(named(added[0]!, 'shared-protobase-ui')).toBe(true)
  })

  it('loads the pages, the libraries only they use and the texts of each language as they are needed', () => {
    for (const lazy of ['list-page', 'record-page', 'composed-page', 'lib-recharts', 'lib-ajv', 'lib-jsonata', 'lib-zod', 'en', 'nl', 'workflows']) {
      expect([...chunks.keys()].some((file) => named(file, lazy)), lazy).toBe(true)
      expect([...withPlugins].filter((file) => named(file, lazy)), lazy).toEqual([])
    }
  })

  it('loads none of the charts’ library with a list, and none of the workflow engine’s with a record', () => {
    const list = loadedWith([[...chunks.keys()].find((file) => named(file, 'list-page'))!], chunks)
    const record = loadedWith([[...chunks.keys()].find((file) => named(file, 'record-page'))!], chunks)
    expect([...list].filter((file) => named(file, 'lib-recharts') || named(file, 'lib-ajv'))).toEqual([])
    expect([...record].filter((file) => named(file, 'workflows') || named(file, 'lib-ajv') || named(file, 'lib-jsonata'))).toEqual([])
  })

  it('has no chunk of a library that imports a chunk of first-party code, so it changes only with its package', () => {
    const libraries = [...chunks.values()].filter((chunk) => named(chunk.file, 'lib'))
    expect(libraries.length).toBeGreaterThan(0)
    expect(libraries.filter((chunk) => !chunk.imports.every(thirdParty)).map((chunk) => chunk.file)).toEqual([])
  })

  it('names in protobase.shell.json the native packages it runs on in the mobile app', async () => {
    expect((await readShell(dir)).native).toEqual(pinnedNative)
  })
})
