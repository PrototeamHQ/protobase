import { useState } from 'react'
import type { FilterState } from './filter-config'
import { emptyFilterState } from './filter-state'

/** Controlled when `value` is given, otherwise keeps its own state. */
export const useFilterState = (value: FilterState | undefined, defaultValue: FilterState | undefined, onChange: ((next: FilterState) => void) | undefined) => {
  const [local, setLocal] = useState(defaultValue ?? emptyFilterState)
  const state = value ?? local
  const update = (next: FilterState) => {
    setLocal(next)
    onChange?.(next)
  }
  return [state, update] as const
}
