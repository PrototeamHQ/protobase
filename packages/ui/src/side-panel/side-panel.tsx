import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useIsDesktop } from '../lib/use-media-query'
import { useVisualViewport } from '../lib/use-visual-viewport'
import { Button } from '../primitives/button'

export type SidePanelProps = {
  /** The heading, and the panel's accessible name. */
  title: string
  icon?: ReactNode
  /** Short text at the end of the header. */
  status?: ReactNode
  onClose?: () => void
  /** Pinned under the content, such as a composer. */
  footer?: ReactNode
  /** The content; it scrolls on its own, so give it `min-h-0 flex-1`. */
  children: ReactNode
}

/**
 * A full-height panel beside the page, for the shell's `rightPanel`: a header with a close button, content and a footer.
 * Below `md` there is no room beside the page, so it covers the screen instead, shrinking with the on-screen keyboard
 * so the footer stays in view.
 */
export const SidePanel = ({ title, icon, status, onClose, footer, children }: SidePanelProps) => {
  const screen = useVisualViewport(!useIsDesktop())
  return (
    <aside
      aria-label={title}
      className="flex h-full w-[380px] max-w-full shrink-0 flex-col border-l border-border bg-surface max-md:fixed max-md:inset-0 max-md:z-40 max-md:w-full max-md:border-l-0"
      style={screen && { top: screen.top, bottom: 'auto', height: screen.height }}
    >
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-4">
        {icon}
        <h2 className="flex-1 text-[13px] font-semibold">{title}</h2>
        {status && <span className="truncate text-xs font-medium text-muted-foreground">{status}</span>}
        {onClose && (
          <Button variant="ghost" size="sm" className="w-7 px-0" aria-label="Close" onClick={onClose}>
            <X className="size-4" />
          </Button>
        )}
      </header>
      {children}
      {footer && <footer className="shrink-0 space-y-2 border-t border-border bg-background p-3">{footer}</footer>}
    </aside>
  )
}
