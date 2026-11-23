import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { userCacheDir } from './user-cache-dir'

describe('userCacheDir', () => {
  it('takes XDG_CACHE_HOME on Linux, and ~/.cache without it or with a relative one', () => {
    expect(userCacheDir({ XDG_CACHE_HOME: '/var/cache/me' }, 'linux', '/home/me')).toBe('/var/cache/me')
    expect(userCacheDir({}, 'linux', '/home/me')).toBe(path.join('/home/me', '.cache'))
    expect(userCacheDir({ XDG_CACHE_HOME: 'cache' }, 'linux', '/home/me')).toBe(path.join('/home/me', '.cache'))
  })

  it("takes the platform's own folder on macOS and Windows", () => {
    expect(userCacheDir({ XDG_CACHE_HOME: '/x' }, 'darwin', '/Users/me')).toBe(path.join('/Users/me', 'Library', 'Caches'))
    expect(userCacheDir({ LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local' }, 'win32', 'C:\\Users\\me')).toBe('C:\\Users\\me\\AppData\\Local')
  })
})
