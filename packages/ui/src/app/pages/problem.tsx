import type { ReactNode } from 'react'

/** A warning in place of something the app cannot draw, such as a component no one registered. */
export const Problem = ({ children }: { children: ReactNode }) => (
  <div role="alert" className="rounded-lg border border-dashed border-warning bg-warning-soft p-3 text-warning-text">
    {children}
  </div>
)
