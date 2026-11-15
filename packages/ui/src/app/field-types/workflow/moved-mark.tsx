import { Pin } from 'lucide-react'
import { useContext } from 'react'
import { cn } from '../../../lib/cn'
import { Button } from '../../../primitives/button'
import { text } from './messages'
import { UnpinContext } from './unpin-context'

// On the box's top right corner, outside what the box shows and clear of the handles down its right side
const place = 'nodrag absolute -top-4 -right-4 z-10'

/**
 * The mark of a node moved by hand, which the layout leaves where it was put: where the canvas takes changes, a button
 * that unpins it, handing it back to the layout.
 */
export const MovedMark = ({ node, name }: { node: string; name: string }) => {
  const unpin = useContext(UnpinContext)
  if (!unpin) {
    return (
      <span className={cn(place, 'inline-flex size-7 items-center justify-center rounded-md border border-border-strong bg-background text-muted-foreground shadow-sm')} title={text('movedByHand')}>
        <Pin className="size-3.5" aria-hidden />
        <span className="sr-only">{text('movedByHand')}</span>
      </span>
    )
  }
  return (
    <Button
      size="icon"
      className={place}
      aria-label={text('unpin', { name })}
      title={text('unpinHelp')}
      onClick={(event) => {
        // The node itself is not chosen by it
        event.stopPropagation()
        unpin(node)
      }}
    >
      <Pin className="size-3.5" aria-hidden />
    </Button>
  )
}
