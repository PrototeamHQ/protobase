import { Monitor, Moon, Sun, SunMoon } from 'lucide-react'
import { Segmented, type SegmentedOption } from '../primitives/segmented'
import type { ThemePreference } from '../theme/theme-preference'
import { text } from './messages'

/** The theme chosen in this browser, and how to choose another. */
export type ProfileTheme = { preference: ThemePreference; onChange: (preference: ThemePreference) => void }

const options = (): Array<SegmentedOption<ThemePreference>> => [
  { value: 'light', label: text('light'), icon: Sun },
  { value: 'dark', label: text('dark'), icon: Moon },
  { value: 'system', label: text('system'), icon: Monitor },
]

/** The profile menu's row that picks light, dark or the system's theme; the menu stays open to show the result. */
export const ThemeSwitch = ({ theme, className }: { theme: ProfileTheme; className: string }) => (
  <div className={className}>
    <SunMoon className="size-4" />
    <span className="flex-1">{text('theme')}</span>
    <Segmented label={text('theme')} iconOnly value={theme.preference} options={options()} onChange={theme.onChange} />
  </div>
)
