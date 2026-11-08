// What an import's file input accepts: its extensions, with the media types a picker that filters by type needs.

const extensions = ['.xlsx', '.csv', '.json']

const mediaTypes = ['text/csv', 'application/json', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']

/**
 * Android's picker filters by media type alone, turning each extension into the one type Android maps it to, so it
 * greys out a file whose provider labels it otherwise: a CSV as `text/comma-separated-values`, `application/csv`,
 * `text/x-csv`, `application/vnd.ms-excel` or `text/plain`, and any file a provider does not know as
 * `application/octet-stream`. The import reads a file by its name, so these are safe to offer there. Elsewhere the
 * picker matches extensions, and the generic types would offer every file.
 */
const androidMediaTypes = ['text/comma-separated-values', 'application/csv', 'text/x-csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream']

const isAndroid = (userAgent: string) => /\bAndroid\b/.test(userAgent)

/** The `accept` of an import's file input on the device with this user agent: `.xlsx`, CSV and JSON files. */
export const importAccept = (userAgent: string) => [...extensions, ...mediaTypes, ...(isAndroid(userAgent) ? androidMediaTypes : [])].join(',')
