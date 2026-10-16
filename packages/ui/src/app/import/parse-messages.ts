import type { SheetRow } from './sheet-cell'

/** What the page asks the parse worker: a file's sheet names, its rows a `chunk` at a time, or the next chunk. */
export type ParseRequest = { type: 'sheets'; file: File } | { type: 'read'; file: File; sheet?: string; chunk: number } | { type: 'next' }

/** What the parse worker answers. */
export type ParseReply = { type: 'sheets'; sheets: string[] } | { type: 'rows'; rows: SheetRow[] } | { type: 'end' } | { type: 'error'; message: string }
