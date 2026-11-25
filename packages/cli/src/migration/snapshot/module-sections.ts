import { moduleDifference, retiredDifference, schemaModules, targetIds, type ModuleTargets, type SchemaModuleId } from '@protobase/server/internal'
import type { Snapshot } from './snapshot-file'

/**
 * What the schema modules of `targets` lack of the snapshot's model, from the snapshot alone: each module's
 * statements, by module, with what of them the code before does not run on and what they leave for once the
 * transaction commits (`after`); and the modules' model once they are applied. A module the config no longer needs stays as the migrations left it, but for each resource's objects, which
 * go, breaking older code (`retiredDifference`). `model` is undefined without any module.
 */
export const moduleSections = (snapshot: Snapshot | undefined, targets: ModuleTargets) => {
  const before = snapshot?.model.modules
  const written = targetIds(targets).map((id) => ({ id, ...moduleDifference(schemaModules[id], targets[id]!, before?.[id]) }))
  const retired = (Object.keys(schemaModules) as SchemaModuleId[]).flatMap((id) => {
    const had = before?.[id]
    return had && !targets[id] ? [{ id, ...retiredDifference(schemaModules[id], had) }] : []
  })
  const changed = [...written, ...retired]
  const sections = changed.flatMap(({ id, sql, after, breaks }) => (sql === undefined ? [] : [{ name: id, title: schemaModules[id].title, sql, breaks, ...(after !== undefined && { after }) }]))
  const model = changed.length > 0 ? { ...before, ...Object.fromEntries(changed.map(({ id, model }) => [id, model])) } : before
  return { sections, model }
}
