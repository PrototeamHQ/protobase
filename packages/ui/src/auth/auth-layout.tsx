import type { ReactNode } from 'react'
import { LogoMark } from '../app-shell'

/** The frame of the sign-in and first-run pages: logo, title and a card. */
export const AuthLayout = ({ title, description, children }: { title: string; description?: string; children: ReactNode }) => (
  <div className="flex min-h-full w-full items-center justify-center bg-surface px-4 py-10">
    <div className="w-full max-w-sm">
      <div className="mb-6 flex flex-col items-center text-center">
        <LogoMark className="size-10" />
        <h1 className="mt-4 text-xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-[13px] text-muted-foreground">{description}</p>}
      </div>
      <div className="rounded-lg border bg-background p-5 shadow-sm">{children}</div>
    </div>
  </div>
)
