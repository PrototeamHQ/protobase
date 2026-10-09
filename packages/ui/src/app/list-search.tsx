import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Input } from '../primitives/input'

/** A search box that commits after a short pause or on Enter. */
export const ListSearch = ({ value, onCommit, placeholder }: { value: string; onCommit: (text: string) => void; placeholder: string }) => {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  useEffect(() => {
    if (text === value) return
    const timer = setTimeout(() => onCommit(text), 350)
    return () => clearTimeout(timer)
  }, [text, value, onCommit])
  return (
    <Input
      wrapperClassName="min-w-0 flex-1 sm:w-72 sm:flex-none"
      leading={<Search className="size-4" />}
      placeholder={placeholder}
      aria-label="Search"
      value={text}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => event.key === 'Enter' && onCommit(text)}
    />
  )
}
