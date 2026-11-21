import type { LookupRead } from './lookup-read'
import { readConditions } from './read-conditions'

/** How a read reads a lookup field, with the conditions the caller's scope on the linked resource keeps to. */
export const lookupRead = (read: Omit<LookupRead, 'conditions'>): LookupRead => ({ ...read, conditions: readConditions(read.model, read.scope) })
