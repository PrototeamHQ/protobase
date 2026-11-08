import { mkdtemp, mkdir, rm, symlink } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { localFolder } from './local-folder'

let base: string
beforeEach(async () => { base = await mkdtemp(join(tmpdir(), 'storage-root-')) })
afterEach(async () => { await rm(base, { recursive: true, force: true }) })

describe('localFolder', () => {
  it('makes the folder inside the root', async () => {
    const made = await localFolder(join(base, 'root'), 'invoices/2026', [join(base, 'files/private')])
    expect(made.endsWith(join('root', 'invoices', '2026'))).toBe(true)
    expect(existsSync(made)).toBe(true)
  })

  it('refuses a folder that leaves the root, even through a symlink, and creates nothing outside it', async () => {
    for (const dir of ['../outside', '/abs', '.tmp', 'a/../../b']) await expect(localFolder(join(base, 'root'), dir, [])).rejects.toMatchObject({ error: 'Storage.NotFound' })
    await mkdir(join(base, 'elsewhere'))
    await mkdir(join(base, 'root'))
    await symlink(join(base, 'elsewhere'), join(base, 'root', 'link'))
    await expect(localFolder(join(base, 'root'), 'link/inner', [])).rejects.toMatchObject({ error: 'Storage.NotFound' })
    expect(existsSync(join(base, 'elsewhere', 'inner'))).toBe(false)
  })

  it("refuses a root that overlaps a provider's folder, also through a symlink", async () => {
    const files = join(base, 'files')
    await mkdir(join(files, 'private', 'workflows'), { recursive: true })
    await expect(localFolder(join(files, 'private', 'workflows'), 'a', [join(files, 'private')])).rejects.toThrow('overlaps the folder of a file provider')
    await expect(localFolder(base, 'a', [join(files, 'private')])).rejects.toThrow('overlaps the folder of a file provider')
    await symlink(join(files, 'private'), join(base, 'root-link'))
    await expect(localFolder(join(base, 'root-link'), 'a', [join(files, 'private')])).rejects.toThrow('overlaps the folder of a file provider')
  })
})
