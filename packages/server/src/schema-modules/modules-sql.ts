import { moduleDifference } from './module-difference'
import { schemaModules, targetIds, type ModuleTargets } from './modules'

/**
 * The schema modules of `targets`, in their order, as a migration writes them on a database without them, with what
 * they leave for after the transaction run in it.
 */
export const modulesSql = (targets: ModuleTargets) =>
  targetIds(targets)
    .flatMap((id) => {
      const { sql, after } = moduleDifference(schemaModules[id], targets[id]!, undefined)
      return [sql!, ...(after === undefined ? [] : [after])]
    })
    .join('\n\n')
