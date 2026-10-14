import { describe, expect, it } from 'vitest'
import type { FileProvider, FileStore } from './store'
import { trustedImageHosts } from './trusted-hosts'

const store = {} as FileStore
const provider = (options: Partial<FileProvider> = {}): FileProvider => ({ store, public: false, ...options })

describe('trustedImageHosts', () => {
  it('names the hosts public providers link from and those the config adds, each once', () => {
    const providers = {
      private: provider(),
      public: provider({ public: true, publicUrl: 'https://files.acme.example/public' }),
      media: provider({ public: true, publicUrl: 'https://files.acme.example/media' }),
      local: provider({ public: true, publicUrl: '/static/files' }),
    }
    expect(trustedImageHosts(providers, ['images.example.com', 'files.acme.example'])).toEqual(['files.acme.example', 'images.example.com'])
    expect(trustedImageHosts({ private: provider() })).toEqual([])
  })

  it('refuses a host written with a scheme, port, path or capitals', () => {
    for (const host of ['https://images.example.com', 'images.example.com:8443', 'images.example.com/photos', 'Images.example.com', '']) {
      expect(() => trustedImageHosts({}, [host])).toThrow(`files.trustedHosts: "${host}" is not a host name`)
    }
  })
})
