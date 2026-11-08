import { useState } from 'react'
import { Button } from '../../../primitives/button'
import { text } from './messages'

/** Under a value of a run: use it as a test run's input, and copy it whole, whatever the screen cuts. */
export const ValueButtons = ({ value, onUse }: { value: unknown; onUse?: (() => void) | undefined }) => {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2))
    setCopied(true)
  }
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      {onUse && <Button size="sm" onClick={onUse}>{text('useAsTestInput')}</Button>}
      <Button size="sm" onClick={() => void copy()}>{text('copyJson')}</Button>
      <span role="status" className="text-xs text-muted-foreground">{copied && text('copied')}</span>
    </div>
  )
}
