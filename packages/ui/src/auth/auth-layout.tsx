import type { ReactNode } from 'react'
import { LogoMark } from '../app-shell'
import { cn } from '../lib/cn'

export type AuthLayoutProps = {
  title: string
  description?: string
  /** How wide the card is: `sm`, the default, for a few short inputs; `md` for a form with longer ones. */
  size?: 'sm' | 'md'
  children: ReactNode
}

/**
 * The frame of the sign-in and first-run pages and of public forms: logo, title and a card. On a page as short as a
 * phone's above its keyboard the logo and most of the margins go, so the card still shows whole above the keyboard.
 */
export const AuthLayout = ({ title, description, size = 'sm', children }: AuthLayoutProps) => (
  <div className="flex min-h-full w-full items-center justify-center bg-surface px-4 pb-[calc(2.5rem+var(--pb-safe-bottom))] pt-[calc(2.5rem+var(--pb-safe-top))] short:pb-[calc(1rem+var(--pb-safe-bottom))] short:pt-[calc(1rem+var(--pb-safe-top))]">
    <div className={cn('w-full', size === 'sm' ? 'max-w-sm' : 'max-w-lg')}>
      <div className="mb-6 flex flex-col items-center text-center short:mb-4">
        <LogoMark className="size-10 short:hidden" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight short:mt-0">{title}</h1>
        {description && <p className="mt-1 text-muted-foreground">{description}</p>}
      </div>
      <div className="rounded-lg border bg-background p-5 shadow-sm">{children}</div>
    </div>
  </div>
)
