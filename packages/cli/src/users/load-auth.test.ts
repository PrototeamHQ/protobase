import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadProjectAuth, loadSignIn } from './load-auth'

const dirs: string[] = []

const projectWithSignInOff = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'protobase-sign-in-off-'))
  dirs.push(dir)
  writeFileSync(path.join(dir, 'protobase.config.json'), JSON.stringify({ auth: false }))
  return dir
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('loadSignIn', () => {
  it('has no sign-in to build when the config turns it off, without needing a database', async () => {
    expect(await loadSignIn(projectWithSignInOff())).toBeUndefined()
  })

  it('is refused by the commands that manage users', async () => {
    await expect(loadProjectAuth(projectWithSignInOff())).rejects.toThrow('Sign-in is off')
  })
})
