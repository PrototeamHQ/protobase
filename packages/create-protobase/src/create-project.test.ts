import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createProject } from './create-project'

const template = () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'create-protobase-template-'))
  mkdirSync(path.join(dir, 'config'))
  writeFileSync(path.join(dir, 'config', 'index.ts'), 'export default []\n')
  writeFileSync(path.join(dir, '_.gitignore'), 'node_modules\n')
  writeFileSync(path.join(dir, '_bunfig.toml'), '[run]\n')
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'scratch', private: true }))
  return dir
}

const target = (name: string) => path.join(mkdtempSync(path.join(tmpdir(), 'create-protobase-')), name)

describe('createProject', () => {
  it('copies the template, names the package after the folder and drops the leading _ of the files packing would leave out', () => {
    const dir = target('my-app')
    createProject(template(), dir)
    expect(readFileSync(path.join(dir, 'config', 'index.ts'), 'utf8')).toBe('export default []\n')
    expect(readFileSync(path.join(dir, '.gitignore'), 'utf8')).toBe('node_modules\n')
    expect(readFileSync(path.join(dir, 'bunfig.toml'), 'utf8')).toBe('[run]\n')
    expect(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))).toEqual({ name: 'my-app', private: true })
  })

  it('writes into an empty folder that exists', () => {
    const dir = target('empty')
    mkdirSync(dir)
    createProject(template(), dir)
    expect(JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8')).name).toBe('empty')
  })

  it('refuses a folder that is not empty', () => {
    const dir = target('taken')
    mkdirSync(dir)
    writeFileSync(path.join(dir, 'notes.txt'), 'mine')
    expect(() => createProject(template(), dir)).toThrow(`${dir} is not empty`)
  })
})
