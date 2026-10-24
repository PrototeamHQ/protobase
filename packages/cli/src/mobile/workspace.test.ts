import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { protobaseVersion } from '../version/version'
import { mobileSpec, prepareWorkspace, workspaceDir, workspacePackageJson } from './workspace'

describe('workspaceDir', () => {
  it('is .protobase/mobile in the project', () => {
    expect(workspaceDir('/project')).toBe(path.join('/project', '.protobase', 'mobile'))
  })
})

describe('mobileSpec', () => {
  it('is the CLI\'s version, or this repository\'s package from source', () => {
    expect(mobileSpec(false)).toBe(protobaseVersion)
    expect(mobileSpec(true)).toBe(`file:${path.resolve(import.meta.dirname, '../../../mobile')}`)
  })
})

describe('prepareWorkspace', () => {
  let dir = ''
  afterEach(() => rmSync(dir, { recursive: true, force: true }))
  const packageJson = workspacePackageJson({ mobileSpec: '0.14.2', plugins: { '@capacitor/camera': '^8.0.0' } })
  const installed = (name: string) => {
    mkdirSync(path.join(dir, 'node_modules', name), { recursive: true })
    writeFileSync(path.join(dir, 'node_modules', name, 'package.json'), '{}')
  }

  it('writes a package.json of @protobase/mobile and the plugins, and a .gitignore ignoring the folder', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-ws-'))
    const calls: string[][] = []
    await prepareWorkspace(dir, packageJson, async (command, args) => void calls.push([command, ...args]))
    expect(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))).toEqual({ private: true, dependencies: { '@protobase/mobile': '0.14.2', '@capacitor/camera': '^8.0.0' } })
    expect(readFileSync(path.join(dir, '.gitignore'), 'utf8')).toBe('*\n')
    expect(calls).toEqual([['npm', 'install', '--install-links', '--no-audit', '--no-fund']])
  })

  it('installs again only when the package.json changed or a package is missing', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-ws-'))
    const calls: string[][] = []
    const run = async (command: string, args: string[]) => void calls.push([command, ...args])
    await prepareWorkspace(dir, packageJson, run)
    installed('@protobase/mobile')
    await prepareWorkspace(dir, packageJson, run)
    expect(calls).toHaveLength(2)
    installed('@capacitor/camera')
    await prepareWorkspace(dir, packageJson, run)
    expect(calls).toHaveLength(2)
    await prepareWorkspace(dir, workspacePackageJson({ mobileSpec: '0.14.3' }), run)
    expect(calls).toHaveLength(3)
  })

  it('copies a file: package again on every run', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-ws-'))
    const copies: Array<{ mobile: boolean; camera: boolean }> = []
    const present = (name: string) => existsSync(path.join(dir, 'node_modules', name, 'package.json'))
    const run = async () => void copies.push({ mobile: present('@protobase/mobile'), camera: present('@capacitor/camera') })
    const local = workspacePackageJson({ mobileSpec: 'file:/somewhere/mobile', plugins: { '@capacitor/camera': '^8.0.0' } })
    await prepareWorkspace(dir, local, run)
    installed('@protobase/mobile')
    installed('@capacitor/camera')
    await prepareWorkspace(dir, local, run)
    expect(copies).toEqual([{ mobile: false, camera: false }, { mobile: false, camera: true }])
  })

  it('refuses a file: plugin whose name leaves node_modules, deleting nothing', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-ws-'))
    const ws = path.join(dir, 'project', '.protobase', 'mobile')
    writeFileSync(path.join(dir, 'keep'), '')
    const calls: string[][] = []
    const bad = workspacePackageJson({ mobileSpec: '0.14.2', plugins: { '../..': 'file:../plugin' } })
    await expect(prepareWorkspace(ws, bad, async (command, args) => void calls.push([command, ...args]))).rejects.toThrow('mobile.plugins lists "../..", which is not an npm package name')
    expect(existsSync(path.join(dir, 'keep'))).toBe(true)
    expect(existsSync(ws)).toBe(true)
    expect(calls).toEqual([])
  })

  it('fails when npm does', async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-ws-'))
    await expect(prepareWorkspace(dir, packageJson, () => Promise.reject(new Error('npm failed')))).rejects.toThrow('npm failed')
  })
})
