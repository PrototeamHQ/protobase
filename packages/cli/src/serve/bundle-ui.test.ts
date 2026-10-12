import { describe, expect, it } from 'vitest'
import type { BundleLayout } from '../bundle/manifest'
import { bundleUi } from './bundle-ui'

describe('bundleUi', () => {
  it("names the bundle's plugins on the app's origin, and the field types they register with the storage types each shows", () => {
    const manifest: BundleLayout = {
      version: 3,
      server: 'protobase.config.js',
      public: 'public',
      spa: 'index.html',
      api: ['/api'],
      plugins: [
        { name: 'crm', path: 'plugins/crm/plugin.json', api: 1, protobase: '>=0.12.0', fields: { phone: ['text'] } },
        { name: 'app', path: 'plugins/app/plugin.json', api: 1, protobase: '>=0.12.0', fields: { rating: ['integer', 'decimal'] } },
      ],
      shell: { protobase: '0.12.0', pluginApi: 1, paths: ['/index.html', '/assets'] },
    }
    expect(bundleUi(manifest)).toEqual({ plugins: ['/plugins/crm/plugin.json', '/plugins/app/plugin.json'], fieldTypes: { phone: ['text'], rating: ['integer', 'decimal'] } })
  })
})
