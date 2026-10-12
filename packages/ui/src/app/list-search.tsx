import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { cn } from '../lib/cn'
import { Input } from '../primitives/input'

/** A search box that commits after a short pause or on Enter; `className` goes on its frame. */
export const ListSearch = ({ value, onCommit, placeholder, className }: { value: string; onCommit: (text: string) => void; placeholder: string; className?: string }) => {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  useEffect(() => {
    if (text === value) return
    const timer = setTimeout(() => onCommit(text), 350)
    return () => clearTimeout(timer)
  }, [text, value, onCommit])
  return (
    <Input
      wrapperClassName={cn('min-w-0 flex-1 sm:w-72 sm:flex-initial', className)}
      leading={<Search className="size-4" />}
      placeholder={placeholder}
      aria-label="Search"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => event.key === 'Enter' && onCommit(text)}
    />
  )
}
