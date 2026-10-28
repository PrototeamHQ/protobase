import type { ResourceModel } from './model'

// The key's values are compared in the database as the API writes them: an encrypted value is sealed anew on every
// write and a file value is server-made text, so neither would ever match an existing record's.
export const openExistingProblems = (model: ResourceModel) => {
  const names = model.openExisting
  if (!names) return []
  if (names.length === 0) return ['openExisting names no field']
  return names.flatMap((name, index) => {
    const field = model.fields[name]!
    return [
      ...(field.encrypted ? ['is encrypted'] : []),
      ...(field.file ? ['is a file field'] : []),
      ...(names.indexOf(name) !== index ? ['is given twice'] : []),
    ].map((problem) => `openExisting field "${name}" ${problem}`)
  })
}
