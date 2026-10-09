import { mkdir, mkdtemp, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { writePackage } from '../../../tests/support/packages'
import { findPackageDir, packageName } from './package-dir'

describe('packageName', () => {
  it('names the package of a bare import, scoped or not', () => {
    expect(packageName('pg')).toBe('pg')
    expect(packageName('pg/lib/client')).toBe('pg')
    expect(packageName('@hono/node-server')).toBe('@hono/node-server')
    expect(packageName('@hono/node-server/serve-static')).toBe('@hono/node-server')
  })

  it('is undefined for paths, built-ins and virtual modules', () => {
    for (const id of ['./data', '../config', '/abs/file.ts', 'fs', 'node:fs', 'fs/promises', 'bun:sqlite', '\0virtual', 'virtual:entry', '@scope']) {
      expect(packageName(id)).toBeUndefined()
    }
  })
})

describe('findPackageDir', () => {
  it('walks up to the nearest node_modules holding the package and resolves its symlink', async () => {
    const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'protobase-find-')))
    const store = await writePackage(path.join(dir, 'store'), { name: 'linked' })
    await mkdir(path.join(dir, 'app/node_modules'), { recursive: true })
    await symlink(store, path.join(dir, 'app/node_modules/linked'))
    await mkdir(path.join(dir, 'app/config/orders'), { recursive: true })

    expect(await findPackageDir('linked', path.join(dir, 'app/config/orders'))).toBe(store)
    expect(await findPackageDir('absent', path.join(dir, 'app/config/orders'))).toBeUndefined()
    await rm(dir, { recursive: true, force: true })
  })
})
