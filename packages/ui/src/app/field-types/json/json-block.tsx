/** A JSON value written out on several lines, wrapped so the page scrolls rather than a box of its own. */
export const JsonBlock = ({ value }: { value: unknown }) => (
  <pre className="whitespace-pre-wrap break-words rounded-md bg-muted/60 px-3 py-2 font-mono text-xs text-foreground">{JSON.stringify(value, null, 2)}</pre>
)
