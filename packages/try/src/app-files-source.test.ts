import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { appFilesSource, bundleFiles } from './app-files-source'

describe('app files', () => {
  let dir = ''
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'protobase-try-'))
    mkdirSync(path.join(dir, 'public', 'assets'), { recursive: true })
    writeFileSync(path.join(dir, 'protobase.config.js'), 'a')
    writeFileSync(path.join(dir, 'public', 'assets', 'app.js'), 'b')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('lists the bundle files with forward slashes, sorted', () => {
    expect(bundleFiles(dir)).toEqual(['protobase.config.js', 'public/assets/app.js'])
  })

  it('embeds each file and names the bundle by its contents', () => {
    const source = appFilesSource(dir, bundleFiles(dir))
    expect(source).toContain(`import f1 from './app/public/assets/app.js' with { type: 'file' }`)
    expect(source).toContain(`["public/assets/app.js", f1],`)
    writeFileSync(path.join(dir, 'protobase.config.js'), 'changed')
    expect(appFilesSource(dir, bundleFiles(dir)).match(/id: '(\w+)'/)![1]).not.toBe(source.match(/id: '(\w+)'/)![1])
  })
})
