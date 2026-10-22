import { useIsDesktop } from '../lib/use-media-query'
import { isTextMode, type SidebarMode } from './sidebar-mode'

/**
 * Whether the shell draws its `sidebarNotice`: where the sidebar shows at full width, from the `md` breakpoint up in a
 * text mode. Collapsed to icons, or a drawer on phones, it has no room, so the app says the same another way.
 */
export const useSidebarNoticeShown = (mode: SidebarMode) => {
  const desktop = useIsDesktop()
  return desktop && isTextMode(mode)
}
