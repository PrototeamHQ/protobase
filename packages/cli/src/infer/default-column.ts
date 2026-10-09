import { f, resource } from '@protobase/schema'

const cache = new Map<string, string>()

// The column a field name maps to when `.column()` is absent; asked of the schema builder so it
// stays the single source of truth.
export const defaultColumn = (fieldName: string) => {
  const cached = cache.get(fieldName)
  if (cached) return cached
  const model = resource('probe')
    .table('probe')
    .fields({ [fieldName]: f.text() })
    .primaryKey((r) => (r as Record<string, never>)[fieldName]!)
    .toModel()
  const column = model.fields[fieldName]!.column
  cache.set(fieldName, column)
  return column
}
