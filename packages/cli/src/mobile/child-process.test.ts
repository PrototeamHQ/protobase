import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { runChild } from './child-process'

// A spawn that records its call and ends as told.
const fakeSpawn = (end: { status?: number; code?: string }) => {
  const calls: unknown[][] = []
  const spawn = ((...args: unknown[]) => {
    calls.push(args)
    const child = Object.assign(new EventEmitter(), { kill: () => true })
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

  it('hands a signal that would end the CLI to the child, and fails once the child ended on it', async () => {
    const before = process.listenerCount('SIGTERM')
    const killed: string[] = []
    const child = Object.assign(new EventEmitter(), { kill: (signal: string) => void killed.push(signal) })
    const spawn = (() => child) as unknown as typeof import('node:child_process').spawn
    const running = runChild('gradlew', [':app:bundleRelease'], { cwd: '/ws', env: {} }, spawn)
    process.emit('SIGTERM', 'SIGTERM')
    process.emit('SIGHUP', 'SIGHUP')
    expect(killed).toEqual(['SIGTERM', 'SIGHUP'])
    child.emit('close', null, 'SIGTERM')
    await expect(running).rejects.toThrow('`gradlew :app:bundleRelease` ended on SIGTERM')
    expect(process.listenerCount('SIGTERM')).toBe(before)
  })
})
