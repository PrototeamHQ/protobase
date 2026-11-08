import { createContext, useContext } from 'react'

/** What a value field asks of the page around it: to choose a value to insert, which comes back as a change of the field. */
export type ValueInsert = (field: { label: string; value: unknown; set: (next: unknown) => void }) => void

export const ValueInsertContext = createContext<ValueInsert | undefined>(undefined)

export const useValueInsert = () => useContext(ValueInsertContext)
