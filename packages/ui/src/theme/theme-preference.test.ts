import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { readThemePreference, resolveTheme, themePreferences, themeStorageKey, writeThemePreference, type ThemePreference } from './theme-preference'

const memory = (initial: Record<string, string> = {}) => {
  const data = new Map(Object.entries(initial))
  return { data, getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => void data.set(key, value), removeItem: (key: string) => void data.delete(key) }
}

const blocked = () => {
  throw new DOMException('blocked', 'SecurityError')
}
const unavailable = { getItem: blocked, setItem: blocked, removeItem: blocked }

describe('the theme preference', () => {
  it('follows the system until someone picks a theme', () => {
    expect(readThemePreference(memory())).toBe('system')
  })

  it('remembers a picked theme, and stores nothing for the system', () => {
    const storage = memory()
    writeThemePreference(storage, 'dark')
    expect(readThemePreference(storage)).toBe('dark')
    expect(storage.data.get(themeStorageKey)).toBe('dark')
    writeThemePreference(storage, 'light')
    expect(readThemePreference(storage)).toBe('light')
    writeThemePreference(storage, 'system')
    expect(readThemePreference(storage)).toBe('system')
    expect(storage.data.size).toBe(0)
  })

  it('follows the system for a stored value it does not know', () => {
    expect(readThemePreference(memory({ [themeStorageKey]: 'sepia' }))).toBe('system')
  })

  it('follows the system when storage is unavailable', () => {
    expect(readThemePreference(unavailable)).toBe('system')
    expect(() => writeThemePreference(unavailable, 'dark')).not.toThrow()
  })

  it('resolves the system to its scheme, and a picked theme to itself', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

// index.html sets the theme before the app's code loads; it has to agree with resolveTheme on every input.
describe('the theme index.html sets before the first paint', () => {
  const html = readFileSync(path.join(import.meta.dirname, '../app/index.html'), 'utf8')
  const [, code] = /<script>([\s\S]*?)<\/script>/.exec(html) ?? []

  const run = (storage: Pick<Storage, 'getItem'>, systemDark: boolean) => {
    const document = { documentElement: { dataset: {} as Record<string, string> } }
    const matchMedia = (query: string) => ({ matches: query === '(prefers-color-scheme: dark)' && systemDark })
    new Function('localStorage', 'document', 'matchMedia', code!)(storage, document, matchMedia)
    return document.documentElement.dataset.theme
  }

  it('is in the head, ahead of the app', () => {
    expect(code).toBeDefined()
    expect(html.indexOf('<script>')).toBeLessThan(html.indexOf('</head>'))
  })

  it('agrees with resolveTheme', () => {
    for (const preference of [...themePreferences, 'sepia'] as ThemePreference[])
      for (const systemDark of [true, false]) {
        const storage = memory()
        writeThemePreference(storage, preference)
        expect(run(storage, systemDark)).toBe(resolveTheme(readThemePreference(storage), systemDark))
      }
  })

  it('follows the system when storage is unavailable', () => {
    expect(run(unavailable, true)).toBe('dark')
    expect(run(unavailable, false)).toBe('light')
  })
})
