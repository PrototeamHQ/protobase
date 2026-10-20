import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { runChild } from './child-process'

// A spawn that records its call and ends as told.
const fakeSpawn = (end: { status?: number; code?: string }) => {
  const calls: unknown[][] = []
  const spawn = ((...args: unknown[]) => {
    calls.push(args)
    const child = new EventEmitter()
    queueMicrotask(() => (end.code ? child.emit('error', Object.assign(new Error('spawn failed'), { code: end.code })) : child.emit('close', end.status)))
    return child
  }) as unknown as typeof import('node:child_process').spawn
  return { spawn, calls }
}

describe('runChild', () => {
  it('passes the arguments as a list and exactly the environment given, without a shell', async () => {
    const { spawn, calls } = fakeSpawn({ status: 0 })
    await runChild('npm', ['install', 'a b'], { cwd: '/ws', env: { PATH: '/bin', CI: 'true' } }, spawn)
    expect(calls).toEqual([['npm', ['install', 'a b'], { cwd: '/ws', env: { PATH: '/bin', CI: 'true' }, stdio: 'inherit' }]])
  })

  it('fails with the command\'s status, or when it is not installed', async () => {
    await expect(runChild('npm', ['install'], { cwd: '/ws', env: {} }, fakeSpawn({ status: 1 }).spawn)).rejects.toThrow('`npm install` exited with status 1')
    await expect(runChild('npm', ['install'], { cwd: '/ws', env: {} }, fakeSpawn({ code: 'ENOENT' }).spawn)).rejects.toThrow('npm is not installed, or not on PATH')
  })
})
