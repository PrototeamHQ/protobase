import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { functionFiles } from './functions-folder'

describe('functionFiles', () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'protobase-functions-'))
  })
  afterEach(() => rm(dir, { recursive: true, force: true }))

  const touch = (...files: string[]) =>
    Promise.all(files.map(async (file) => {
      await mkdir(path.dirname(path.join(dir, file)), { recursive: true })
      await writeFile(path.join(dir, file), '')
    }))

  it('finds functions/<name>.ts and functions/<name>/index.ts, sorted by name', async () => {
    await touch('functions/send-invoice.ts', 'functions/stripe-webhook/index.ts', 'functions/stripe-webhook/verify.ts', 'functions/hello.ts')
    expect(functionFiles(dir)).toEqual([
      { name: 'hello', file: path.join(dir, 'functions/hello.ts') },
      { name: 'send-invoice', file: path.join(dir, 'functions/send-invoice.ts') },
      { name: 'stripe-webhook', file: path.join(dir, 'functions/stripe-webhook/index.ts') },
    ])
  })

  it('skips shared code, hidden files, tests, declarations and other files', async () => {
    await touch('functions/_shared/cors.ts', 'functions/_utils.ts', 'functions/.env', 'functions/hello.test.ts', 'functions/hello.spec.ts', 'functions/env.d.ts', 'functions/README.md', 'functions/hello.ts')
    expect(functionFiles(dir).map(({ name }) => name)).toEqual(['hello'])
  })

  it('finds none without a functions folder', () => {
    expect(functionFiles(dir)).toEqual([])
  })

  it('refuses a name defined twice and a folder without index.ts', async () => {
    await touch('functions/hello.ts', 'functions/hello/index.ts')
    expect(() => functionFiles(dir)).toThrow(`The function "hello" is both`)
    await rm(path.join(dir, 'functions/hello.ts'))
    await touch('functions/lib/helpers.ts')
    expect(() => functionFiles(dir)).toThrow('functions/lib has no index.ts; a folder of shared code is named with a leading _, such as functions/_lib')
  })
})
