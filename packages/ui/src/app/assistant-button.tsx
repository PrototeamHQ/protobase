import { Sparkles } from 'lucide-react'
import { Button } from '../primitives/button'
import { text as appText } from './messages'

/** Below `md`, where search is a button too, only the icon shows; the hidden text still names it. */
export const AssistantButton = ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
  <Button size="sm" variant={open ? 'primary' : 'secondary'} aria-pressed={open} onClick={onToggle} className="max-md:size-9 max-md:p-0">
    <Sparkles className="size-3.5" />
    <span className="max-md:sr-only">{appText('assistant')}</span>
  </Button>
)
