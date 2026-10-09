import type { ReactNode } from 'react'

export const Kbd = ({ children }: { children: ReactNode }) => (
  <kbd className="inline-flex h-5 items-center rounded border border-border-strong bg-background px-1.5 font-sans text-[11px] font-medium text-muted-foreground">{children}</kbd>
)
