import { useState } from 'react'
import { CodeBlock } from '../../../primitives/code-block'
import { Button } from '../../../primitives/button'
import { foldOf } from './json-fold'
import { text } from './messages'

/** A JSON value written out on several lines, folded to its first lines when it is long, with a button that unfolds it. */
export const JsonBlock = ({ value }: { value: unknown }) => {
  const [open, setOpen] = useState(false)
  const full = JSON.stringify(value, null, 2)
  const { lines, folded } = foldOf(full)
  if (folded === null) return <CodeBlock>{full}</CodeBlock>
  return (
    <div className="grid gap-1">
      <CodeBlock>{open ? full : folded}</CodeBlock>
      <Button size="sm" variant="ghost" className="-ml-2 justify-self-start" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? text('showLess') : text('showAll', { count: lines })}
      </Button>
    </div>
  )
}
