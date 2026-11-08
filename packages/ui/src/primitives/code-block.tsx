import type { ReactNode } from 'react'

/** Text such as code or JSON in full, in a monospaced block that wraps its long lines, so the page scrolls rather than a box of its own. */
export const CodeBlock = ({ children }: { children: ReactNode }) => (
  <pre className="whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md bg-muted/60 px-3 py-2 font-mono text-xs text-foreground">{children}</pre>
)
