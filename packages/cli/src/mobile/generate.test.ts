import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { generatePlatform } from './generate'
import { writeProtobaseIcon, writeTemplateIcon } from './native-icon-fixture'

const plist = '<plist version="1.0">\n<dict>\n</dict>\n</plist>\n'

let ws = ''
afterEach(() => rmSync(ws, { recursive: true, force: true }))

// A `cap add` that writes the template's icon, and the SPM template's Info.plist for iOS.
const cap = (calls: string[][]) => async (args: string[]) => {
  calls.push(args)
  writeProtobaseIcon(ws)
  writeTemplateIcon(ws, args[1] === 'ios' ? 'ios' : 'android')
  if (args[1] !== 'ios') return
  mkdirSync(path.join(ws, 'ios', 'App', 'App'), { recursive: true })
  writeFileSync(path.join(ws, 'ios', 'App', 'App', 'Info.plist'), plist)
}
const infoPlist = () => readFileSync(path.join(ws, 'ios', 'App', 'App', 'Info.plist'), 'utf8')

describe('generatePlatform', () => {
  it('replaces the native project, leaving iOS transport security alone for an https API', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    mkdirSync(path.join(ws, 'ios'))
    writeFileSync(path.join(ws, 'ios', 'edited.swift'), '')
    const calls: string[][] = []
    await generatePlatform(ws, 'ios', { cleartext: false }, cap(calls))
    expect(calls).toEqual([['add', 'ios']])
    expect(existsSync(path.join(ws, 'ios', 'edited.swift'))).toBe(false)
    expect(infoPlist()).toBe(plist)
  })

  it('allows only local networking on iOS for a plain http API', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    await generatePlatform(ws, 'ios', { cleartext: true }, cap([]))
    expect(infoPlist()).toContain('<key>NSAllowsLocalNetworking</key>')
    expect(infoPlist()).not.toContain('NSAllowsArbitraryLoads')
  })

  it('changes no plist for Android', async () => {
    ws = mkdtempSync(path.join(tmpdir(), 'protobase-generate-'))
    const calls: string[][] = []
    await generatePlatform(ws, 'android', { cleartext: true }, cap(calls))
    expect(calls).toEqual([['add', 'android']])
  })
})
