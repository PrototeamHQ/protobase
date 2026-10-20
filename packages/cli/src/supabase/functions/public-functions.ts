// A `[functions.<name>]` table header, the name bare or quoted.
const functionTable = /^\[functions\.(?:"([^"]+)"|([A-Za-z0-9_-]+))\]$/

/**
 * The functions `supabase/config.toml` opens to anyone with `verify_jwt = false`; Supabase checks a token for the
 * others. Only the lines of `[functions.<name>]` tables are read.
 */
export const publicFunctions = (toml: string) => {
  const names = new Set<string>()
  let current: string | undefined
  for (const raw of toml.split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim()
    if (line.startsWith('[')) {
      const table = functionTable.exec(line)
      current = table ? (table[1] ?? table[2]) : undefined
      continue
    }
    if (current !== undefined && /^verify_jwt\s*=\s*false$/.test(line)) names.add(current)
  }
  return names
}
