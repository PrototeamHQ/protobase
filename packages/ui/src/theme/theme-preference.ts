import { guarded } from '../lib/guarded'

/** What the app is drawn in: the tokens under `:root`, or those under `[data-theme="dark"]` too. */
export type Theme = 'light' | 'dark'

/** What a person chose in the profile menu: a theme, or whatever their system uses. */
export type ThemePreference = Theme | 'system'

export const themePreferences: ThemePreference[] = ['light', 'dark', 'system']

/** Where the choice is kept in this browser; index.html reads the same key before the first paint. */
export const themeStorageKey = 'protobase:theme'

/** Matches while the system asks for dark. */
export const systemDarkQuery = '(prefers-color-scheme: dark)'

const isPreference = (value: string | null): value is ThemePreference => themePreferences.includes(value as ThemePreference)

/** The choice made in this browser; the system's until someone picks a theme, or when storage is unavailable. */
export const readThemePreference = (storage: Pick<Storage, 'getItem'>) =>
  guarded<ThemePreference>(() => {
    const stored = storage.getItem(themeStorageKey)
    return isPreference(stored) ? stored : 'system'
  }, 'system')

/** Remembers a picked theme; following the system again is the default, so it costs no storage. */
export const writeThemePreference = (storage: Pick<Storage, 'setItem' | 'removeItem'>, preference: ThemePreference) =>
  guarded(() => (preference === 'system' ? storage.removeItem(themeStorageKey) : storage.setItem(themeStorageKey, preference)), undefined)

/** The theme to draw in, for a choice and whether the system asks for dark. */
export const resolveTheme = (preference: ThemePreference, systemDark: boolean): Theme => (preference === 'system' ? (systemDark ? 'dark' : 'light') : preference)
