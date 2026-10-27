import type { ResourceModel } from '@protobase/schema'
import type { Issue } from './check'

// A relation names the resource it points to, and the app refuses to start on one the config does not declare.
export const relationIssues = (model: ResourceModel, models: ResourceModel[]): Issue[] =>
  Object.entries(model.fields).flatMap(([name, field]) => {
    const resource = field.relation?.resource
    if (!resource || models.some((each) => each.name === resource)) return []
    return [
      {
        severity: 'error',
        resource: model.name,
        message: `${name}: points to resource "${resource}", which the config does not declare`,
        suggestion: `declare it, or scaffold its table with \`protobase scaffold\``,
      },
    ]
  })
