/** What the `Prefer` header asks for, of what `/rest/v1` does; anything else in it is left alone, as PostgREST does by default. */
export type Preferences = {
  return?: 'minimal' | 'representation' | 'headers-only'
  count?: 'exact' | 'planned' | 'estimated'
  resolution?: 'merge-duplicates' | 'ignore-duplicates'
  missing?: 'default' | 'null'
}

const known: { [K in keyof Preferences]-?: readonly NonNullable<Preferences[K]>[] } = {
  return: ['minimal', 'representation', 'headers-only'],
  count: ['exact', 'planned', 'estimated'],
  resolution: ['merge-duplicates', 'ignore-duplicates'],
  missing: ['default', 'null'],
}

/** Reads `Prefer: return=representation, count=exact`, in one header or several; the first of each kind counts. */
export const parsePrefer = (header: string | null): Preferences => {
  const preferences: Record<string, string> = {}
  for (const part of header?.split(',') ?? []) {
    const [name = '', value = ''] = part.trim().split('=').map((text) => text.trim())
    if (name in known && !(name in preferences) && (known[name as keyof Preferences] as readonly string[]).includes(value)) preferences[name] = value
  }
  return preferences as Preferences
}
