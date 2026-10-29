import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { releaseManifestFile } from '@protobase/schema/internal'
import { manifestFile } from '../bundle/manifest'
import { buildWebPart, placeholderWebPart } from './web-part'
import { bundleManifest as manifest } from './web-build-fixture'

const files = (dir: string, prefix = ''): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (entry.isDirectory() ? files(path.join(dir, entry.name), `${prefix}${entry.name}/`) : [`${prefix}${entry.name}`]))

describe('buildWebPart', () => {
  let ws = ''
  afterEach(() => rmSync(ws, { recursive: true, force: true }))

  it('keeps only the bundle\'s public files, its index.html naming the API, with their manifest, and removes the bundle', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-web-part-'))
    const build = async ({ outDir }: { outDir: string }) => {
      mkdirSync(path.join(outDir, 'node_modules', 'x'), { recursive: true })
      writeFileSync(path.join(outDir, manifestFile), JSON.stringify(manifest({ builtAt: 1_800_000_000_000 })))
      mkdirSync(path.join(outDir, 'public', 'assets'), { recursive: true })
      writeFileSync(path.join(outDir, 'protobase.config.js'), 'export const secret = 1')
      writeFileSync(path.join(outDir, 'node_modules', 'x', 'index.js'), '')
      writeFileSync(path.join(outDir, 'public', 'index.html'), '<head></head>')
      writeFileSync(path.join(outDir, 'public', 'assets', 'a.js'), '')
    }
    mkdirSync(path.join(ws, 'web'))
    writeFileSync(path.join(ws, 'web', 'stale.js'), '')
    expect(await buildWebPart({ projectDir: '/project', ws, extensions: [], apiOrigin: 'https://api.example.com', build })).toEqual({ builtInOrder: [1_800_000_000_000, 0] })
    expect(files(path.join(ws, 'web')).sort()).toEqual(['assets/a.js', releaseManifestFile, 'index.html'])
    const index = readFileSync(path.join(ws, 'web', 'index.html'))
    expect(index.toString()).toBe('<head><meta name="protobase-api-origin" content="https://api.example.com"></head>')
    expect(JSON.parse(readFileSync(path.join(ws, 'web', releaseManifestFile), 'utf8'))).toEqual([
      { href: 'assets/a.js', checksum: createHash('sha256').update('').digest('hex'), sizeInBytes: 0 },
      { href: 'index.html', checksum: createHash('sha256').update(index).digest('hex'), sizeInBytes: index.byteLength },
    ])
    expect(existsSync(path.join(ws, 'bundle'))).toBe(false)
  })

  it('gives no order for a bundle that names no build time, so the live updater is left out', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-web-part-'))
    const build = async ({ outDir }: { outDir: string }) => {
      mkdirSync(path.join(outDir, 'public'), { recursive: true })
      writeFileSync(path.join(outDir, manifestFile), JSON.stringify(manifest({})))
      writeFileSync(path.join(outDir, 'public', 'index.html'), '<head></head>')
    }
    expect(await buildWebPart({ projectDir: '/project', ws, extensions: [], apiOrigin: 'https://api.example.com', build })).toEqual({ builtInOrder: undefined })
  })

  it('stands in a page for --live', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-web-part-'))
    await placeholderWebPart(ws)
    expect(files(path.join(ws, 'web'))).toEqual(['index.html'])
  })
})
