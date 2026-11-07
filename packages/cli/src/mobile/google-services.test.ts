import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { googleServicesFile, hasGoogleServices, missingGoogleServices } from './google-services'

let dir = ''
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('hasGoogleServices', () => {
  it('finds the file next to protobase.config.ts, and none when it is missing', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-firebase-'))
    expect(await hasGoogleServices(dir)).toBe(false)
    writeFileSync(googleServicesFile(dir), '{}')
    expect(googleServicesFile(dir)).toBe(path.join(dir, 'google-services.json'))
    expect(await hasGoogleServices(dir)).toBe(true)
  })

  it('refuses a link or a folder in its place, which the copy would follow out of the project', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-firebase-'))
    writeFileSync(path.join(dir, 'elsewhere.json'), '{}')
    symlinkSync(path.join(dir, 'elsewhere.json'), googleServicesFile(dir))
    await expect(hasGoogleServices(dir)).rejects.toThrow('google-services.json is not a regular file')
    rmSync(googleServicesFile(dir))
    mkdirSync(googleServicesFile(dir))
    await expect(hasGoogleServices(dir)).rejects.toThrow('is not a regular file')
  })
})

describe('missingGoogleServices', () => {
  it('names the path it looks for', () => {
    expect(missingGoogleServices('/work/shop')).toBe("/work/shop/google-services.json is missing: the Android app builds without push. Put your Firebase project's google-services.json there to turn it on")
  })
})
