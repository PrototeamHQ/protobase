import { Search } from 'lucide-react'
import { useState } from 'react'
import { formatInt } from '../format/number'
import { Checkbox } from '../primitives/checkbox'
import { Input } from '../primitives/input'
import type { FacetGroupConfig } from './filter-config'
import { matchesSearch } from './filter-state'

export type FacetGroupProps = { config: FacetGroupConfig; selected: string[]; onToggle: (value: string) => void }

export const FacetGroup = ({ config, selected, onToggle }: FacetGroupProps) => {
  const [query, setQuery] = useState('')
  const options = config.options.filter((option) => matchesSearch(option.label, query))
  return (
    <div className="flex flex-col gap-1">
      {config.searchable && (
        <Input
          wrapperClassName="mb-1 h-7"
          leading={<Search className="size-3.5" />}
          placeholder={`Search ${config.label.toLowerCase()}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      )}
      {options.map((option) => (
        <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted">
          <Checkbox checked={selected.includes(option.value)} onChange={() => onToggle(option.value)} label={option.label} />
          <span className="flex-1 truncate">{option.label}</span>
          <span className="text-xs tabular-nums text-faint-foreground">{formatInt(option.count)}</span>
        </label>
      ))}
      {options.length === 0 && <span className="px-1 py-1 text-xs text-faint-foreground">No matches</span>}
    </div>
  )
}
