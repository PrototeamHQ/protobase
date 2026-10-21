import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildShell } from '../../src/build/shell'

// A lazy chunk that imports `app` or `vendor` is downloaded again whenever they change: on every release for `app`.
const largeChunk = 50_000

type Chunk = { file: string; size: number; imports: string[] }

// The shell's scripts, each with the scripts it imports statically.
const readChunks = async (assets: string) => {
  const chunks = new Map<string, Chunk>()
  for (const file of (await readdir(assets)).filter((name) => name.endsWith('.js'))) {
    const code = await readFile(path.join(assets, file), 'utf8')
    const imports = [...code.matchAll(/\b(?:from|import)\s*["']\.\/([^"']+\.js)["']/g)].map((match) => match[1]!)
    chunks.set(file, { file, size: Buffer.byteLength(code), imports })
  }
  return chunks
}

// The scripts index.html loads, through its module script and import map, and all they import statically.
const initialChunks = (html: string, chunks: Map<string, Chunk>) => {
  const roots = [...html.matchAll(/"\/assets\/([^"]+\.js)"/g)].map((match) => match[1]!)
  const initial = new Set<string>()
  const visit = (file: string) => {
    if (initial.has(file)) return
    initial.add(file)
    for (const imported of chunks.get(file)?.imports ?? []) visit(imported)
  }
  for (const root of roots) visit(root)
  return initial
}

const named = (file: string, name: string) => file.startsWith(`${name}-`)
const importsChunk = (chunk: Chunk, name: string) => chunk.imports.some((file) => named(file, name))

describe('the built shell’s chunk graph', () => {
  let dir: string
  let chunks: Map<string, Chunk>
  let initial: Set<string>

  beforeAll(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-shell-chunks-'))
    await buildShell(dir)
    chunks = await readChunks(path.join(dir, 'assets'))
    initial = initialChunks(await readFile(path.join(dir, 'index.html'), 'utf8'), chunks)
  }, 120_000)

  afterAll(() => rm(dir, { recursive: true, force: true }))

  it('has react and vendor chunks that import no app, loaded from the start', () => {
    const shared = [...chunks.values()].filter((chunk) => named(chunk.file, 'react') || named(chunk.file, 'vendor'))
    expect(shared.map((chunk) => chunk.file.split('-')[0]).sort()).toEqual(['react', 'vendor'])
    for (const chunk of shared) {
      expect(initial).toContain(chunk.file)
      expect(importsChunk(chunk, 'app')).toBe(false)
    }
  })

  it('has no large lazy chunk that imports app or vendor', () => {
    const lazy = [...chunks.values()].filter((chunk) => !initial.has(chunk.file) && chunk.size > largeChunk)
    expect(lazy.length).toBeGreaterThan(0)
    expect(lazy.filter((chunk) => importsChunk(chunk, 'app') || importsChunk(chunk, 'vendor')).map((chunk) => chunk.file)).toEqual([])
  })
})
