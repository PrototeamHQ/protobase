import { expect, it } from 'vitest'
import { webManifestRoute } from './web-manifest-route'

it('answers the manifest named for the app, with the favicon as its icon', async () => {
  const response = await webManifestRoute('Property Finder').request('/manifest.webmanifest')
  expect(response.status).toBe(200)
  expect(response.headers.get('content-type')).toBe('application/manifest+json')
  expect(await response.json()).toEqual({
    name: 'Property Finder',
    short_name: 'Property Finder',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    icons: [{ src: '/protobase.favicon.svg', sizes: 'any', type: 'image/svg+xml' }],
  })
})
