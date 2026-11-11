import type { ReactNode } from 'react'

/**
 * The box a thread scrolls in. It scrolls inside a box of its own, not with the page, so it can open at the newest
 * message and follow the ones that arrive, with what comes after it, such as a composer, in view beneath.
 */
export const ThreadBox = ({ children }: { children: ReactNode }) => <div className="flex h-[min(36rem,65dvh)] flex-col rounded-lg border border-border bg-background">{children}</div>
