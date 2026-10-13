import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useMediaQuery } from '../lib/use-media-query'
import { readThemePreference, resolveTheme, systemDarkQuery, themeStorageKey, writeThemePreference, type Theme, type ThemePreference } from './theme-preference'

export type ThemeState = { preference: ThemePreference; theme: Theme; choose: (preference: ThemePreference) => void }

const ThemeContext = createContext<ThemeState | undefined>(undefined)

/**
 * Draws the page in the theme this browser chose, or the system's, by setting `data-theme` on the root element, and
 * follows the system and other tabs as they change. index.html sets the same before the first paint.
 */
export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [preference, setPreference] = useState(() => readThemePreference(localStorage))
  const theme = resolveTheme(preference, useMediaQuery(systemDarkQuery))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  // A choice made in another tab of the app
  useEffect(() => {
    const follow = (event: StorageEvent) => {
      if (event.key === themeStorageKey || event.key === null) setPreference(readThemePreference(localStorage))
    }
    window.addEventListener('storage', follow)
    return () => window.removeEventListener('storage', follow)
  }, [])

  const choose = (next: ThemePreference) => {
    writeThemePreference(localStorage, next)
    setPreference(next)
  }
  return <ThemeContext.Provider value={{ preference, theme, choose }}>{children}</ThemeContext.Provider>
}

export const useTheme = () => {
  const state = useContext(ThemeContext)
  if (!state) throw new Error('useTheme needs a ThemeProvider above it')
  return state
}
