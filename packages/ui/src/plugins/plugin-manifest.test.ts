import { describe, expect, it } from 'vitest'
import { parseManifest } from './plugin-manifest'

const valid = {
  name: 'hello',
  version: '1.0.0',
  api: 1,
  imports: { '@protobase/ui': ['definePlugin'], 'react/jsx-runtime': ['jsx'] },
  extensionPoints: ['components'],
  entry: 'assets/index-abc.js',
  css: 'assets/index-def.css',
}

describe('parseManifest', () => {
  it('reads what protobase build-plugin writes', () => {
    expect(parseManifest(valid)).toEqual({ manifest: valid })
    expect(parseManifest({ ...valid, protobase: '>=0.12.0' })).toEqual({ manifest: { ...valid, protobase: '>=0.12.0' } })
    const { version: _version, css: _css, ...bare } = valid
    expect(parseManifest({ ...bare, extra: true })).toEqual({ manifest: bare })
  })

  it('says what is missing or wrong', () => {
    expect(parseManifest([])).toEqual({ problem: 'its plugin.json is not an object' })
    expect(parseManifest({ ...valid, name: ' ' })).toEqual({ problem: 'its plugin.json names no plugin' })
    expect(parseManifest({ ...valid, api: '1' })).toEqual({ problem: 'its plugin.json names no plugin API' })
    expect(parseManifest({ ...valid, protobase: 3 })).toEqual({ problem: 'its plugin.json names Protobase versions that are no text' })
    const noUses = { problem: 'its plugin.json does not say what it uses from Protobase; rebuild it with protobase build-plugin' }
    expect(parseManifest({ ...valid, imports: undefined })).toEqual(noUses)
    expect(parseManifest({ ...valid, imports: { react: 'useState' } })).toEqual(noUses)
    expect(parseManifest({ ...valid, extensionPoints: undefined })).toEqual(noUses)
    expect(parseManifest({ ...valid, entry: 3 })).toEqual({ problem: 'its plugin.json names no module' })
    expect(parseManifest({ ...valid, css: '' })).toEqual({ problem: 'its plugin.json names a stylesheet that is no URL' })
    expect(parseManifest({ ...valid, version: 1 })).toEqual({ problem: 'its plugin.json has a version that is no text' })
  })
})
