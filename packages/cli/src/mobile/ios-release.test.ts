import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildIosAutomatic, iosApiKey, iosArchiveArgs, iosExportArgs, iosExportOptions } from './ios-release'

const dirs: string[] = []
const tempDir = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'protobase-ios-release-'))
  dirs.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const key = { path: '/keys/AuthKey_ABC.p8', id: 'ABC', issuer: 'issuer-id' }
const keyArgs = ['-authenticationKeyPath', '/keys/AuthKey_ABC.p8', '-authenticationKeyID', 'ABC', '-authenticationKeyIssuerID', 'issuer-id']

describe('iosApiKey', () => {
  it('is nothing with none of its variables', () => {
    expect(iosApiKey({}, '/project')).toBeUndefined()
  })

  it('makes the key file absolute against the project folder', () => {
    const dir = tempDir()
    writeFileSync(path.join(dir, 'AuthKey.p8'), 'key')
    expect(iosApiKey({ PROTOBASE_IOS_API_KEY_PATH: 'AuthKey.p8', PROTOBASE_IOS_API_KEY_ID: 'ABC', PROTOBASE_IOS_API_KEY_ISSUER: 'issuer-id' }, dir)).toEqual({ path: path.join(dir, 'AuthKey.p8'), id: 'ABC', issuer: 'issuer-id' })
  })

  it('refuses some of its variables, naming the ones missing', () => {
    expect(() => iosApiKey({ PROTOBASE_IOS_API_KEY_ID: 'ABC' }, '/project')).toThrow('set PROTOBASE_IOS_API_KEY_PATH, PROTOBASE_IOS_API_KEY_ISSUER')
  })

  it('refuses a key that is not a file', () => {
    const dir = tempDir()
    expect(() => iosApiKey({ PROTOBASE_IOS_API_KEY_PATH: dir, PROTOBASE_IOS_API_KEY_ID: 'ABC', PROTOBASE_IOS_API_KEY_ISSUER: 'issuer-id' }, dir)).toThrow('which is not a file')
    expect(() => iosApiKey({ PROTOBASE_IOS_API_KEY_PATH: 'gone.p8', PROTOBASE_IOS_API_KEY_ID: 'ABC', PROTOBASE_IOS_API_KEY_ISSUER: 'issuer-id' }, dir)).toThrow('which is not a file')
  })
})

describe('the xcodebuild arguments', () => {
  it('let Xcode provision the archive and the export, with the account in Xcode', () => {
    expect(iosArchiveArgs('ABCDE12345', undefined).slice(-2)).toEqual(['DEVELOPMENT_TEAM=ABCDE12345', '-allowProvisioningUpdates'])
    expect(iosExportArgs(undefined).at(-1)).toBe('-allowProvisioningUpdates')
  })

  it('give both steps the API key', () => {
    expect(iosArchiveArgs('ABCDE12345', key).slice(-6)).toEqual(keyArgs)
    expect(iosExportArgs(key).slice(-6)).toEqual(keyArgs)
  })
})

describe('buildIosAutomatic', () => {
  it('writes the export options before the export, and runs both steps in the native project', async () => {
    const ws = tempDir()
    const cwd = path.join(ws, 'ios', 'App')
    mkdirSync(cwd, { recursive: true })
    const calls: { command: string; verb: string | undefined; cwd: string; options: string | undefined }[] = []
    const run = async (command: string, args: string[], options: { cwd: string }) => {
      const written = args.includes('-exportArchive') ? readFileSync(path.join(cwd, 'archive.plist'), 'utf8') : undefined
      calls.push({ command, verb: args.find((arg) => arg === 'archive' || arg === '-exportArchive'), cwd: options.cwd, options: written })
    }
    await buildIosAutomatic({ ws, env: {}, team: 'ABCDE12345', key: undefined }, run)
    expect(calls).toEqual([
      { command: 'xcodebuild', verb: 'archive', cwd, options: undefined },
      { command: 'xcodebuild', verb: '-exportArchive', cwd, options: iosExportOptions('ABCDE12345') },
    ])
  })
})
