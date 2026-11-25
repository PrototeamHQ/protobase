import { moduleDifference } from './module-difference'
import { schemaModules, targetIds, type ModuleTargets } from './modules'

/** The schema modules of `targets`, in their order, as a migration writes them on a database without them. */
export const modulesSql = (targets: ModuleTargets) => targetIds(targets).map((id) => moduleDifference(schemaModules[id], targets[id]!, undefined).sql!).join('\n\n')
