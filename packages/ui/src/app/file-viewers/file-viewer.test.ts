import { describe, expect, it } from 'vitest'
import { fileNamed, viewedFile, viewerFor, type ViewedFile } from './file-viewer'

const file = (name: string): ViewedFile => ({ uri: `private://${name}`, name, type: 'image/png', url: `/files/${name}` })

describe('file viewers', () => {
  it('take a stored file with a link, never an empty, missing or unlinked one', () => {
    expect(viewedFile({ uri: 'private://a', name: 'a.png', type: 'image/png', size: 3, url: '/files/a' })).toEqual({ uri: 'private://a', name: 'a.png', type: 'image/png', size: 3, url: '/files/a' })
    expect(viewedFile({ uri: 'private://a', missing: true })).toBeUndefined()
    expect(viewedFile({ uri: 'private://a', name: 'a.png', type: 'image/png' })).toBeUndefined()
    expect(viewedFile(null)).toBeUndefined()
  })

  it('find the viewer by the exact media type, and none for a name the registry only inherits', () => {
    const viewer = { component: () => null }
    expect(viewerFor({ 'application/vnd.example.report+json': viewer }, 'application/vnd.example.report+json')).toBe(viewer)
    expect(viewerFor({ 'application/vnd.example.report+json': viewer }, 'application/json')).toBeUndefined()
    expect(viewerFor({}, 'constructor')).toBeUndefined()
    expect(viewerFor(undefined, 'application/json')).toBeUndefined()
  })

  it('find a sibling by the last segment of a relative reference, never by an absolute one', () => {
    const siblings = [file('before.png'), file('demo.mp4')]
    expect(fileNamed(siblings, 'before.png')).toBe(siblings[0])
    expect(fileNamed(siblings, 'shots/before.png?raw=1#top')).toBe(siblings[0])
    expect(fileNamed(siblings, './demo.mp4')).toBe(siblings[1])
    expect(fileNamed(siblings, 'https://example.com/before.png')).toBeUndefined()
    expect(fileNamed(siblings, '/before.png')).toBeUndefined()
    expect(fileNamed(siblings, 'after.png')).toBeUndefined()
  })
})
