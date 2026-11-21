import type { ResourceModel } from './model'

// The codes the API's field errors use themselves, which a check's name would be mistaken for
const builtInCodes = ['required', 'invalid-value', 'read-only', 'unknown-field', 'invalid-record']

// Postgres keeps the first 63 bytes of a name, so a longer one never matches the constraint the error names
const longestName = 63

/** What makes a resource's `.checks()` unusable: a name the database cannot hold or an error code already means, or an empty label. */
export const checksProblems = (model: ResourceModel) =>
  Object.entries(model.checks ?? {}).flatMap(([name, check]) => [
    ...(name === '' ? ['check has no name'] : []),
    ...(new TextEncoder().encode(name).length > longestName ? [`check "${name}" is longer than the ${longestName} bytes Postgres keeps of a name`] : []),
    ...(builtInCodes.includes(name) ? [`check "${name}" has the name of an error code the API uses itself`] : []),
    ...(check.label.trim() === '' ? [`check "${name}" has no label`] : []),
  ])
