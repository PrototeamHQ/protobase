import type { Locale } from '@protobase/schema/internal'
import type { SheetRow } from './sheet-cell'

/**
 * What the page asks the parse worker: a file's sheet names, its rows a `chunk` at a time, or the next chunk. A file
 * comes with the language the page is in, which the worker's own messages are written in.
 */
export type ParseRequest = { type: 'sheets'; file: File; locale: Locale } | { type: 'read'; file: File; sheet?: string; chunk: number; locale: Locale } | { type: 'next' }

/** What the parse worker answers. */
export type ParseReply = { type: 'sheets'; sheets: string[] } | { type: 'rows'; rows: SheetRow[] } | { type: 'end' } | { type: 'error'; message: string }
