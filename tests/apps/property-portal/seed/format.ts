const escapes: Record<string, string> = { '\\': '\\\\', '\t': '\\t', '\n': '\\n', '\r': '\\r' }

const cell = (value: unknown) => {
  if (value === null || value === undefined) return '\\N'
  return String(value).replace(/[\\\t\n\r]/g, (char) => escapes[char]!)
}

// One COPY text-format row.
export const row = (...values: unknown[]) => values.map(cell).join('\t') + '\n'

export const iso = (ms: number) => new Date(ms).toISOString()

export const slugify = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
