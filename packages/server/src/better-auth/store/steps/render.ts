import type { RawBuilder } from 'kysely'
import { builtInModules, type ModuleId } from '../../names/modules'
import { moduleSteps } from '.'
import type { MigrationNames, Step } from './step'

/**
 * A step to apply: its own statements, its check first; or, with `on`, the statements it adds to that module's tables.
 * `version` is the version of the former single chain whose tables and columns they make (`legacy-versions.ts`): the
 * later of the step's and that of the step that made the module's tables, as the former chain made them.
 */
export type RenderedStep = { module: ModuleId; step: Step; on?: ModuleId; version: number; statements: RawBuilder<unknown>[] }

/** Whether the store has applied `step` of `module`. */
export type Had = (module: ModuleId, step: Step) => boolean

const addsOn = (names: MigrationNames, module: ModuleId, step: Step, on: ModuleId): RenderedStep => ({
  module,
  step,
  on,
  version: Math.max(step.version, moduleSteps[on][0]!.version),
  statements: step.adds![on]!(names),
})

/**
 * The steps the store lacks of the modules that are on, in order: each module's in its chain's order, the modules in
 * the order they require one another. A module the store has none of, such as one just turned on, gets its whole
 * chain, and the statements other modules' steps add to its tables, those the store has applied included; a module
 * that is off gets nothing, and no other module adds to its tables.
 */
export const renderSteps = (names: MigrationNames, modules: readonly ModuleId[], had: Had): RenderedStep[] => {
  const on = builtInModules.map(({ id }) => id).filter((module) => modules.includes(module))
  const rendered: RenderedStep[] = []
  // The statements steps add to a module whose tables come later in this order.
  const waiting: RenderedStep[] = []
  const made = new Set(on.filter((module) => had(module, moduleSteps[module][0]!)))
  const turnedOn = on.filter((module) => !made.has(module))
  for (const module of on) {
    for (const step of moduleSteps[module].filter((step) => !had(module, step))) {
      rendered.push({ module, step, version: step.version, statements: [...(step.check ? [step.check(names)] : []), ...step.statements(names)] })
      for (const target of on.filter((target) => step.adds?.[target])) (made.has(target) ? rendered : waiting).push(addsOn(names, module, step, target))
    }
    made.add(module)
    rendered.push(...waiting.filter((adds) => adds.on === module))
    if (!turnedOn.includes(module)) continue
    for (const other of on.filter((other) => other !== module)) {
      for (const step of moduleSteps[other].filter((step) => step.adds?.[module] && had(other, step))) rendered.push(addsOn(names, other, step, module))
    }
  }
  return rendered
}
