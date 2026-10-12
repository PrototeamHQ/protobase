import { describe, expect, it } from 'vitest'
import { parseManifest } from './plugin-manifest'

const valid = { name: 'hello', version: '1.0.0', api: 1, protobase: '>=0.12.0', entry: 'assets/index-abc.js', css: 'assets/index-def.css' }

describe('parseManifest', () => {
  it('reads what protobase build-plugin writes', () => {
    expect(parseManifest(valid)).toEqual({ manifest: valid })
    const { version: _version, css: _css, ...bare } = valid
    expect(parseManifest({ ...bare, extra: true })).toEqual({ manifest: bare })
  })

  it('says what is missing or wrong', () => {
    expect(parseManifest([])).toEqual({ problem: 'its plugin.json is not an object' })
    expect(parseManifest({ ...valid, name: ' ' })).toEqual({ problem: 'its plugin.json names no plugin' })
    expect(parseManifest({ ...valid, api: '1' })).toEqual({ problem: 'its plugin.json names no plugin API' })
    expect(parseManifest({ ...valid, protobase: undefined })).toEqual({ problem: 'its plugin.json names no Protobase versions' })
    expect(parseManifest({ ...valid, entry: 3 })).toEqual({ problem: 'its plugin.json names no module' })
    expect(parseManifest({ ...valid, css: '' })).toEqual({ problem: 'its plugin.json names a stylesheet that is no URL' })
    expect(parseManifest({ ...valid, version: 1 })).toEqual({ problem: 'its plugin.json has a version that is no text' })
  })
})
