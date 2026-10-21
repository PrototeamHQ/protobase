import { describe, expect, it } from 'vitest'
import { webManifest } from './web-manifest'

describe('webManifest', () => {
  it("carries the app's colours and its PNGs beside the favicon, but the Apple touch icon, which the page links", () => {
    const manifest = webManifest('Property Finder', { themeColor: '#0d9488', backgroundColor: '#ffffff' }, { favicon: true, png: ['icon192', 'icon512', 'maskable', 'appleTouch'] })
    expect(manifest).toMatchObject({ theme_color: '#0d9488', background_color: '#ffffff' })
    expect(manifest.icons).toEqual([
      { src: '/protobase.favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/protobase.icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/protobase.icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/protobase.icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ])
  })

  it('names no colour and no PNG the project does not have', () => {
    const manifest = webManifest('Shop', {}, { favicon: false, png: ['icon512'] })
    expect(manifest).not.toHaveProperty('theme_color')
    expect(manifest).not.toHaveProperty('background_color')
    expect(manifest.icons.map((icon) => icon.src)).toEqual(['/protobase.favicon.svg', '/protobase.icon-512.png'])
  })
})
