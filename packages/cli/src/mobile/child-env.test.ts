import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { childEnv, envFileKeys, projectEnvFiles } from './child-env'

const dirs: string[] = []
const scratch = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'protobase-child-env-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

// A project folder with env files of every kind Bun loads or skips, and a secrets file outside it.
const project = () => {
  const [dir, outside] = [scratch(), scratch()]
  writeFileSync(path.join(dir, '.env'), '﻿SECRET=s3cr$t\nDB=postgres://u:${SECRET}@h/db\nSHARED=x\n')
  writeFileSync(path.join(outside, 'local.env'), 'SYM_LOCAL=s3cr$t\n')
  symlinkSync(path.join(outside, 'local.env'), path.join(outside, 'link.env'))
  symlinkSync(path.join(outside, 'link.env'), path.join(dir, '.env.local'))
  writeFileSync(path.join(dir, '.env.development.local'), 'LOCAL_KEY=b\n')
  writeFileSync(path.join(dir, '.env.staging'), 'STAGE=c\n')
  writeFileSync(path.join(dir, '.Env.mixed'), 'MIXED=m\n')
  mkdirSync(path.join(dir, '.env.d'))
  symlinkSync(outside, path.join(dir, '.env.production'))
  symlinkSync(path.join(dir, 'missing'), path.join(dir, '.env.test'))
  writeFileSync(path.join(dir, 'env.txt'), 'NOT_ENV=1\n')
  return dir
}

describe('projectEnvFiles', () => {
  it('lists the .env* files after following links, skipping folders and dangling links', () => {
    const dir = project()
    expect(projectEnvFiles(dir).sort()).toEqual(['.Env.mixed', '.env', '.env.development.local', '.env.local', '.env.staging'].map((name) => path.join(dir, name)).sort())
  })

  it('rethrows what is not a missing file, such as a link to itself', () => {
    const dir = scratch()
    symlinkSync(path.join(dir, '.env.loop'), path.join(dir, '.env.loop'))
    expect(() => projectEnvFiles(dir)).toThrow(expect.objectContaining({ code: 'ELOOP' }))
  })
})

describe('childEnv', () => {
  it('drops every key of the env files, whatever value Bun gave it, and sets CI', () => {
    const env = { SECRET: 's3cr', DB: 'postgres://u:s3cr@h/db', SHARED: 'shell', SYM_LOCAL: 's3cr', LOCAL_KEY: 'b', STAGE: 'c', MIXED: 'm', PATH: '/bin' }
    expect(childEnv(env, envFileKeys(projectEnvFiles(project())))).toEqual({ PATH: '/bin', CI: 'true' })
  })

  it('keeps the environment of a folder without env files, and overrides CI', () => {
    const env = { PATH: '/bin', ANDROID_HOME: '/sdk', CI: 'false' }
    expect(childEnv(env, envFileKeys(projectEnvFiles(scratch())))).toEqual({ PATH: '/bin', ANDROID_HOME: '/sdk', CI: 'true' })
  })
})
