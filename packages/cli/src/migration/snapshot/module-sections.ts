import { latestModules, moduleDifference, schemaModules, type SchemaModuleId } from '@protobase/server/internal'
import type { Snapshot } from './snapshot-file'

/**
 * What the schema modules `needed` lack of the snapshot's model, from the snapshot alone: each module's statements, by
 * module, with what of them the code before does not run on; and the modules' model once they are applied, which
 * keeps a module the config no longer needs as the migrations left it. `model` is undefined without any module.
 */
export const moduleSections = (snapshot: Snapshot | undefined, needed: readonly SchemaModuleId[]) => {
  const before = snapshot?.model.modules
  const sections = needed.flatMap((id) => {
    const { sql, breaks } = moduleDifference(schemaModules[id], before?.[id])
    return sql === undefined ? [] : [{ name: id, title: schemaModules[id].title, sql, breaks }]
  })
  const model = needed.length > 0 ? { ...before, ...latestModules(needed) } : before
  return { sections, model }
}
