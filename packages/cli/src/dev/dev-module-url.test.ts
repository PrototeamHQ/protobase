import { describe, expect, it } from 'vitest'
import { devModuleUrl } from './dev-module-url'

describe('devModuleUrl', () => {
  it('serves a project file under /@fs', () => {
    expect(devModuleUrl('/home/me/app/protobase.config.ts')).toBe('/@fs/home/me/app/protobase.config.ts')
  })

  it('serves a Windows path under /@fs with forward slashes', () => {
    expect(devModuleUrl('C:\\Users\\me\\app\\protobase.config.ts')).toBe('/@fs/C:/Users/me/app/protobase.config.ts')
  })

  it('loads a package file by its file URL, whichever the separator', () => {
    expect(devModuleUrl('/home/me/app/node_modules/pkg/index.js')).toBe('file:///home/me/app/node_modules/pkg/index.js')
    expect(devModuleUrl('C:\\app\\node_modules\\pkg\\index.js')).toMatch(/^file:\/\//)
  })
})
