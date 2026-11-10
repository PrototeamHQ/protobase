import type { ResourceModel } from '../model'

const namePattern = /^[A-Za-z][A-Za-z0-9_]*$/

/** What is wrong with a resource's derived values on their own; their resources and jobs are checked once all are known. */
export const derivedProblems = (model: ResourceModel) => {
  const derived = model.derived ?? []
  const names = derived.map((value) => value.name)
  return derived.flatMap((value) => {
    const problems = [
      ...(namePattern.test(value.name) ? [] : ['may only hold letters, digits and "_", starting with a letter']),
      ...(names.indexOf(value.name) !== names.lastIndexOf(value.name) ? ['is declared twice'] : []),
      ...(!value.into && !value.job ? ['needs `into`, `job` or both'] : []),
    ]
    const own = value.into?.resource === model.name ? model.fields[value.into.field] : undefined
    if (value.into?.resource === model.name && !own) problems.push(`goes into "${value.into.field}", which is not a field`)
    if (own && !own.readOnly) problems.push(`goes into "${own.name}", which must be readOnly(), as Protobase writes it`)
    return problems.map((problem) => `derived value "${value.name}" ${problem}`)
  })
}
