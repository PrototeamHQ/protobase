import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The modules a fresh Bun process has loaded once it imported `entry`, from its module registry.
const loadedBy = (entry: string) => {
  const script = `await import(${JSON.stringify(entry)}); console.log(JSON.stringify(Object.keys(require.cache)))`
  const run = spawnSync('bun', ['-e', script], { encoding: 'utf8' })
  expect(run.stderr).toBe('')
  return JSON.parse(run.stdout) as string[]
}

const heavy = /better-auth|react-email/

describe('@protobase/server/mobile-release', () => {
  it('loads neither Better Auth nor React Email, which the main entry does', () => {
    const light = loadedBy(fileURLToPath(new URL('./mobile-release.ts', import.meta.url)))
    expect(light.some((file) => file.endsWith('/mobile-release/release-app.ts'))).toBe(true)
    expect(light.filter((file) => heavy.test(file))).toEqual([])
    expect(loadedBy(fileURLToPath(new URL('./index.ts', import.meta.url))).some((file) => heavy.test(file))).toBe(true)
  })
})
