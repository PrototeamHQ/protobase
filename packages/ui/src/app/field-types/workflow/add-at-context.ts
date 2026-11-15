import { createContext } from 'react'
import type { AddAt } from './definition-edits'

/** What a click on an editable source handle of the canvas does: opens the step picker for a step added there. */
export const AddAtContext = createContext<((at: AddAt) => void) | undefined>(undefined)
