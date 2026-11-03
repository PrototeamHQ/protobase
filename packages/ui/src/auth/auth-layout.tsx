import type { ReactNode } from 'react'
import { AppMark } from '../app-shell/app-mark'
import { useDocumentTitle } from '../app/document-title'
import { cn } from '../lib/cn'
import { useOptionalAuth } from './auth-provider'

export type AuthLayoutProps = {
  title: string
  description?: string
  /** How wide the card is: `sm`, the default, for a few short inputs; `md` for a form with longer ones. */
  size?: 'sm' | 'md'
  /** The app's name, in place of the one the setup status names, which picks the mark the page shows without an icon. */
  appName?: string
  /** The path of the app's own icon, shown in place of the one the setup status names. */
  icon?: string
  /** What the page ends on, below the card and outside it, such as the "Runs on Protobase" note. */
  footer?: ReactNode
  children: ReactNode
}

/**
 * The frame of the sign-in and first-run pages and of public forms: the app's mark (see `AppMark`), title and a card,
 * the tab named for the app, as the setup status names it. On a page as short as a phone's above its keyboard the mark
 * and most of the margins go, so the card still shows whole above the keyboard.
 */
export const AuthLayout = ({ title, description, size = 'sm', appName, icon, footer, children }: AuthLayoutProps) => {
  const identity = useOptionalAuth()?.identity
  useDocumentTitle(identity?.appName)
  return (
    <div className="flex min-h-full w-full flex-col items-center bg-surface px-4 pb-[calc(2.5rem+var(--pb-safe-bottom))] pt-[calc(2.5rem+var(--pb-safe-top))] short:pb-[calc(1rem+var(--pb-safe-bottom))] short:pt-[calc(1rem+var(--pb-safe-top))]">
      <div className="flex w-full flex-1 items-center justify-center">
        <div className={cn('w-full', size === 'sm' ? 'max-w-sm' : 'max-w-lg')}>
          <div className="mb-6 flex flex-col items-center text-center short:mb-4">
            <AppMark appName={appName ?? identity?.appName} appIcon={icon ?? identity?.appIcon} size="lg" className="short:hidden" />
            <h1 className="mt-4 text-xl font-semibold tracking-tight short:mt-0">{title}</h1>
            {description && <p className="mt-1 text-muted-foreground">{description}</p>}
          </div>
          <div className="rounded-lg border bg-background p-5 shadow-sm">{children}</div>
        </div>
      </div>
      {footer}
    </div>
  )
}
