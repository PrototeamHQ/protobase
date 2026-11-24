import type { ModuleId } from '@protobase/server/internal'
import type { AuthTarget } from './auth-target'
import type { KeptModule, Snapshot } from './snapshot-file'

/** The modules the config turns off or on again since the snapshot. */
export type ModuleChanges = {
  /** Those the snapshot has on and the config turns off, each at its last step. */
  off: KeptModule[]
  /** Those the snapshot keeps while off and the config turns on again, each at the step it was kept at. */
  revived: KeptModule[]
}

/** What the config turns off or on again of the snapshot's modules; none without a store in either. */
export const moduleChanges = (snapshot: Snapshot | undefined, target: AuthTarget | undefined): ModuleChanges => {
  const before = snapshot?.model.auth
  if (!before || !target) return { off: [], revived: [] }
  const on = target.names.names.modules
  const off = (Object.entries(before.modules) as [ModuleId, { lastStep: number }][]).filter(([module]) => !on.includes(module)).map(([module, entry]) => ({ module, step: entry.lastStep }))
  return { off, revived: snapshot.decisions.modules.kept.filter(({ module }) => on.includes(module)) }
}

/** The modules kept once `changes` apply: those turned off join, those turned on again leave, by module. */
export const keptAfter = (kept: readonly KeptModule[], changes: ModuleChanges) =>
  [...kept.filter(({ module }) => !changes.revived.some((revived) => revived.module === module)), ...changes.off].sort((a, b) => a.module.localeCompare(b.module))
